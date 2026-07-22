---
name: verify-locknote-task
description: Run LockNote project verification after implementing, fixing, refactoring, or otherwise changing application code. Use before declaring a coding task complete, and whenever native or web repository APIs change.
---

# Verify a LockNote Task

Run verification from the repository root after completing code changes:

```powershell
npm.cmd test
```

Use `npm test` when the shell permits PowerShell scripts or on macOS/Linux.

If verification fails:

1. Read every failure.
2. Fix failures caused by the task while preserving LockNote's architecture rules.
3. Run the command again.
4. Do not claim the task is complete until it passes.

If an unrelated pre-existing failure prevents a pass, confirm it is unrelated and report the exact failure in the final response. Never hide, skip, or weaken a check merely to obtain a passing result.

The command parses the JavaScript/JSX source and verifies that native SQLite and web AsyncStorage repositories expose matching APIs. Add focused behavioral tests when a task introduces logic that these checks do not cover.
