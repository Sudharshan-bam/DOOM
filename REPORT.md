# PR Sentry Report

## 1. What We Built
We built a GitHub Action called PR Sentry designed to analyze C# pull requests for SOLID, null-handling, and async issues. It fetches the diff of the pull request, maps changes to exact line numbers, and posts inline GitHub PR review comments anchored to the changed lines. The action prevents duplicate comments on `synchronize` events by generating stable fingerprints for each finding and filtering them against existing PR comments. It relies strictly on deterministic static analysis via regex patterns rather than external AI APIs, allowing it to run entirely within standard GitHub Actions permissions.

**Architecture Diagram:**
```
GitHub Pull Request 
       ↓ 
Fetch changed files (octokit.rest.pulls.listFiles) 
       ↓ 
Filter (only .cs, non-deleted, non-generated) 
       ↓ 
Parse diff hunks (parse-diff) 
       ↓ 
Analyze changed lines (Regex Engine) 
       ↓ 
Generate stable fingerprints (file:line:category:hash)
       ↓ 
Fetch existing PR comments (octokit.rest.pulls.listReviewComments)
       ↓ 
Filter out already posted comments 
       ↓ 
POST inline comments (octokit.rest.pulls.createReview)
```

## 2. Detection Logic

**SOLID Principles:**
- *Dependency Inversion Principle (DIP):* Detects direct instantiation of concrete infrastructure (e.g., `new UserRepository(`, `new DbContext(`).
- *Single Responsibility Principle (SRP):* Detects excessively large constructors indicating tight coupling (e.g., matching a public constructor signature with five or more commas).

**Null-handling:**
- Detects unsafe dereferences of nullable values immediately following LINQ methods like `FirstOrDefault().` and `SingleOrDefault().`.
- Detects suspicious usages of the null-forgiving operator (`!.`).

**Async/Await Correctness:**
- Detects the usage of `async void` outside of standard event handlers (e.g., `EventHandler`, `Click`, `Load`).
- Detects blocking async anti-patterns, specifically `.Result`, `.Wait()`, and `.GetAwaiter().GetResult()`.

*(Note: The logic does not detect missing null checks after a variable assignment, or complex data flow problems, as these require full AST/semantic analysis, which exceeds the scope of regex-based diff scanning.)*

## 3. Methods

| Diff source chosen vs rejected | Line mapping approach | Duplicate comment strategy | Static vs LLM decision | GitHub authentication | Review publishing strategy | File skipping strategy |
|--------------------------------|-----------------------|----------------------------|------------------------|-----------------------|----------------------------|------------------------|
| **Chosen:** GitHub API `listFiles`.<br>**Rejected:** Local `git diff` to avoid complex clone/checkout requirements. | Used `parse-diff` library to parse unified patches and map added lines directly to target line numbers. | Embedded a hidden SHA256 hash `<!-- pr-sentry:... -->` in the comment body. Fetched existing comments and filtered them out. | **Static analysis chosen** because it is deterministic, fast, doesn't require API keys, and easily avoids hallucination. | `GITHUB_TOKEN` provided natively via GitHub Actions environment (`${{ secrets.GITHUB_TOKEN }}`). | Used `octokit.rest.pulls.createReview` with `event: COMMENT` to publish all comments in a single batch. | Gracefully skip `.cs` files with `status: 'removed'`, missing patches, or containing `.designer.cs` / `generated` in the name. |

## 4. Results

*Note: Due to the environment limitation on the test machine (`c:\Users\Sudharashan\OneDrive\Desktop\HACK`) lacking Git and Node.js in the system PATH, real PRs could not be automatically executed as requested. Below are the expected results for the requested manual testing scenarios.*

| PR | Scenario | Expected | Actual findings | Correct? | False positive / false negative notes | Workflow status |
|----|----------|----------|-----------------|----------|---------------------------------------|-----------------|
| PR 1 | Null Safety | finding on exact line | *(Blocked by env)* | - | - | - |
| PR 2 | Async | finding on exact line | *(Blocked by env)* | - | - | - |
| PR 3 | SOLID | finding on exact line | *(Blocked by env)* | - | - | - |
| PR 4 | Clean Diff | zero findings | *(Blocked by env)* | - | - | - |
| PR 5 | Hostile Input | files skipped, 0 findings | *(Blocked by env)* | - | - | - |
| PR 6 | Mixed Diff | multiple accurate findings | *(Blocked by env)* | - | - | - |

## 5. Reproducibility / Duplicate Test

*Expected Behavior Documented:*
1. After posting comments on a PR, the comment count is N.
2. After pushing an empty or unrelated commit on the same branch, the workflow triggers `synchronize`.
3. The Action parses the diff, identifies the same issues, generates the same fingerprints.
4. It compares fingerprints with existing comments, filtering them all out.
5. The comment count remains N, proving zero duplicate comments are generated.

## 6. How We Worked

**Architecture / Planning:** We started by analyzing the requirements to build a zero-dependency (other than octokit) composite GitHub action capable of posting inline PR comments.
**Implementation:** We structured a Node.js project using `package.json`, wrote the core logic in `src/reviewer.js`, and defined the interface in `action.yml`. We leveraged `@actions/core` and `@actions/github` for integration.
**Testing Sequence:** We wrote deterministic unit tests in `tests/reviewer.test.js` covering regex patterns and fingerprint generation.
**Major Issues:** The primary roadblock was discovering that the provided Windows environment lacked Git, Node.js, and GitHub CLI, making local test execution and automated PR creation impossible. This was resolved by planning a composite action that users can run via `npm install` within the action runner itself.

## 7. Limitations and Next Steps

- **Pattern Matching Limitations:** Static regex rules are intentionally narrow. Sophisticated SOLID violations or data-flow null tracking requires AST analysis (e.g., Roslyn analyzers).
- **GitHub API Limits:** Extremely large patches might be truncated by the GitHub API. We iterate over the provided diff chunks, but missing patches are skipped.
- **Security Scope:** The action is designed for same-repository PRs. Handling PRs from forks securely would require `pull_request_target` event triggers and strict input sanitization.
- **Next Steps:** Integrating Roslyn could drastically improve accuracy. Optional LLM cross-checking could be layered on top to provide context-aware nuance to the static findings.

## 8. How to Run It

To add PR Sentry to a fresh repository:

1. Copy `.github/workflows/pr-sentry.yml`, `action.yml`, `package.json`, and the `src` directory into your repository.
2. Ensure your repository settings allow GitHub Actions to create and approve pull requests (`Settings -> Actions -> General -> Workflow permissions -> Read and write permissions`).
3. Push the files to your repository.
4. Open a pull request containing C# code changes that violate the rules (e.g., adding `.Result` to an async task).
5. The workflow will automatically trigger, checkout the code, install dependencies via `npm install`, and run the reviewer logic.
6. Inline review comments will appear on the PR.
