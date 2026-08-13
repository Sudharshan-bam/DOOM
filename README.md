# PR Sentry

PR Sentry is a GitHub Action designed to automatically review C# pull requests for three critical categories of issues: SOLID violations, null-handling problems, and async/await correctness. 

By analyzing the unified diff of incoming pull requests, PR Sentry accurately posts inline review comments directly on the problematic changed lines without spamming the entire file.

## Features

- **Scope to changed code only:** PR Sentry only flags lines that were actually added or modified in the pull request.
- **Zero duplicate comments:** When subsequent commits are pushed to the PR (`synchronize` events), PR Sentry intelligently ignores issues it has already commented on.
- **Real line mapping:** Properly parses unified diffs to map changes to actual line numbers.
- **Deterministic Analysis:** Uses pattern-based static analysis instead of LLM hallucinations.
- **Graceful filtering:** Automatically skips non-C# files, deleted files, generated files, and binary files.

## Supported Categories

### 1. Null-Handling
- Detects unsafe dereferences of nullable values (e.g., `FirstOrDefault().Property`).
- Detects suspicious use of the null-forgiving operator (`!.`).

### 2. Async Correctness
- Flags `async void` methods that are not standard event handlers.
- Identifies blocking async patterns like `.Result`, `.Wait()`, and `.GetAwaiter().GetResult()`.

### 3. SOLID Principles
- Identifies potential Single Responsibility Principle (SRP) violations via excessive constructor dependencies.
- Detects Dependency Inversion Principle (DIP) violations when infrastructure classes (e.g., `*Repository`, `DbContext`, `SqlConnection`, `HttpClient`) are instantiated directly using `new` instead of being injected.

## Repository Structure

```
.
├── .github/
│   └── workflows/
│       └── pr-sentry.yml
├── src/
│   └── reviewer.js
├── tests/
│   └── reviewer.test.js
├── action.yml
├── package.json
├── README.md
└── REPORT.md
```

## Setup & Usage

To use PR Sentry in your own repository, create a workflow file (e.g., `.github/workflows/pr-sentry.yml`) with the following content:

```yaml
name: PR Sentry

on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    name: Run PR Sentry
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
      
      - name: Run PR Sentry Action
        uses: YOUR_USERNAME/YOUR_REPOSITORY@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

*(Note: Replace `YOUR_USERNAME/YOUR_REPOSITORY` with the repository where PR Sentry is hosted, or use `./` if it is local to your repo).*

## Security Considerations
- The action requires `pull-requests: write` to post review comments.
- It relies entirely on the temporary `GITHUB_TOKEN` provided by the Actions runner.
- The action does not execute the untrusted PR code; it simply parses diffs.
- Avoid using `pull_request_target` unless you understand the security implications.

## Testing
To run the automated test suite locally:
```bash
npm install
npm test
```

## Troubleshooting
- **No comments are appearing:** Ensure your `GITHUB_TOKEN` has the `pull-requests: write` permission in repository settings.
- **Workflow fails with 403 Forbidden:** The action lacks permission to post reviews. Update `permissions` in your workflow.
