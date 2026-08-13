const core = require('@actions/core');
const github = require('@actions/github');
const parse = require('parse-diff');
const crypto = require('crypto');

const RULES = {
    nullHandling: [
        {
            pattern: /\b(FirstOrDefault|SingleOrDefault|LastOrDefault)\s*\([^)]*\)\s*\./g,
            message: "Dereference of potentially nullable value without null check. Consider checking for null before accessing members."
        },
        {
            pattern: /\w+!\./g,
            message: "Suspicious null-forgiving operator '!.' found. Ensure the value cannot be null."
        }
    ],
    async: [
        {
            pattern: /\basync\s+void\s+(?!.*(?:EventHandler|Click|Load)\s*\()/g,
            message: "'async void' should only be used for event handlers. Use 'async Task' instead."
        },
        {
            pattern: /\.Result\b|\.Wait\(\)|\.GetAwaiter\(\)\.GetResult\(\)/g,
            message: "Blocking async pattern detected. Use 'await' instead of '.Result' or '.Wait()' to avoid deadlocks."
        }
    ],
    solid: [
        {
            // Simple check for >4 parameters in a constructor (assuming constructor name matches class, but we'll just look for public Name(...) with 5+ commas)
            pattern: /public\s+[A-Z]\w*\s*\((?:[^,]+,){5,}[^)]+\)/g,
            message: "Potential Single Responsibility Principle (SRP) violation: excessive constructor dependencies indicate tight coupling."
        },
        {
            pattern: /new\s+[A-Z]\w*(Repository|DbContext|SqlConnection|HttpClient)\s*\(/g,
            message: "Dependency Inversion Principle (DIP) violation: Direct instantiation of infrastructure/concrete classes. Inject the dependency instead."
        }
    ]
};

function generateFingerprint(file, line, category, message) {
    const hash = crypto.createHash('sha256').update(`${file}:${line}:${category}:${message}`).digest('hex');
    return `<!-- pr-sentry:${category}:${file}:${line}:${hash} -->`;
}

async function run() {
    try {
        const token = process.env.GITHUB_TOKEN || core.getInput('github-token');
        if (!token) {
            throw new Error("GitHub token is required.");
        }

        const octokit = github.getOctokit(token);
        const context = github.context;

        if (context.eventName !== 'pull_request') {
            core.info("Not a pull request event. Exiting.");
            return;
        }

        const prNumber = context.payload.pull_request.number;
        const owner = context.repo.owner;
        const repo = context.repo.repo;

        core.info(`Processing PR #${prNumber} in ${owner}/${repo}`);

        // Fetch PR files
        const { data: files } = await octokit.rest.pulls.listFiles({
            owner,
            repo,
            pull_number: prNumber,
            per_page: 100
        });

        const comments = [];

        for (const file of files) {
            // Filter out unsupported files
            if (!file.filename.endsWith('.cs') || file.status === 'removed' || !file.patch) {
                core.info(`Skipping file: ${file.filename}`);
                continue;
            }

            // Simple heuristic to skip generated files
            if (file.filename.toLowerCase().includes('.designer.cs') || file.filename.toLowerCase().includes('generated')) {
                core.info(`Skipping generated file: ${file.filename}`);
                continue;
            }

            // Parse unified diff patch
            const hunks = parse(file.patch)[0]?.chunks || [];
            
            for (const hunk of hunks) {
                for (const change of hunk.changes) {
                    if (change.type === 'add') {
                        const lineNum = change.ln;
                        const lineContent = change.content.substring(1); // Remove the leading '+'

                        // Check rules
                        for (const [category, rules] of Object.entries(RULES)) {
                            for (const rule of rules) {
                                if (rule.pattern.test(lineContent)) {
                                    // Reset regex state since it's global
                                    rule.pattern.lastIndex = 0;
                                    
                                    const fingerprint = generateFingerprint(file.filename, lineNum, category, rule.message);
                                    
                                    comments.push({
                                        path: file.filename,
                                        line: lineNum,
                                        side: "RIGHT",
                                        body: `${fingerprint}\n**[${category}]** ${rule.message}`
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        if (comments.length === 0) {
            core.info("No findings. Skipping review comment.");
            return;
        }

        // Fetch existing review comments to avoid duplicates
        const { data: existingComments } = await octokit.rest.pulls.listReviewComments({
            owner,
            repo,
            pull_number: prNumber,
            per_page: 100
        });

        const newComments = comments.filter(c => {
            // Extract the fingerprint from the new comment
            const match = c.body.match(/<!-- pr-sentry:[^>]+ -->/);
            if (!match) return true;
            const fingerprint = match[0];
            
            // Check if any existing comment has this fingerprint
            return !existingComments.some(ec => ec.body.includes(fingerprint));
        });

        if (newComments.length === 0) {
            core.info("All findings have already been reported. No new comments to post.");
            return;
        }

        core.info(`Posting ${newComments.length} new findings.`);

        // Post review with comments
        await octokit.rest.pulls.createReview({
            owner,
            repo,
            pull_number: prNumber,
            event: 'COMMENT',
            body: `PR Sentry found ${newComments.length} issue(s) in this pull request.`,
            comments: newComments
        });

    } catch (error) {
        core.setFailed(`Action failed with error: ${error.message}`);
    }
}

// Ensure tests can import this without executing it automatically
if (require.main === module) {
    run();
}

module.exports = { run, RULES, generateFingerprint };
