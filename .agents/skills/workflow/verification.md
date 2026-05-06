---
name: verification
description: Use before claiming work is complete, before commits, before PRs, before moving to the next task. Requires running verification commands and confirming output. Evidence before assertions, always.
origin: merged (superpowers/verification-before-completion + ECC/verification-loop)
---

# Verification

## Overview

Claiming work is complete without verification is dishonesty, not efficiency.

**Core principle:** Evidence before claims, always.

**Violating the letter of this rule is violating the spirit of this rule.**

---

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this message, you cannot claim it passes.

---

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY — What command proves this claim?
2. RUN     — Execute the FULL command (fresh, complete)
3. READ    — Full output, check exit code, count failures
4. VERIFY  — Does output confirm the claim?
             → NO:  State actual status with evidence
             → YES: State claim WITH evidence
5. CLAIM   — Only then make the claim

Skip any step = lying, not verifying
```

---

## The 6-Phase Verification Checklist

Run these phases in order before any PR, commit, or completion claim.

### Phase 1: Build
```bash
npm run build 2>&1 | tail -20
# or: pnpm build | go build ./... | cargo build | python -m py_compile src/**/*.py
```
If build fails, **STOP**. Fix before continuing.

### Phase 2: Type Check
```bash
npx tsc --noEmit 2>&1 | head -30          # TypeScript
pyright . 2>&1 | head -30                 # Python
```
Report all type errors. Fix critical ones before proceeding.

### Phase 3: Lint
```bash
npm run lint 2>&1 | head -30              # JS/TS
ruff check . 2>&1 | head -30             # Python
golangci-lint run 2>&1 | head -30        # Go
```

### Phase 4: Tests + Coverage
```bash
npm run test -- --coverage 2>&1 | tail -50
pytest --cov=src --cov-report=term-missing  # Python
go test ./... -coverprofile=coverage.out    # Go
```

Report: total tests / passed / failed / coverage %.
**Coverage target: 80% minimum.**

### Phase 5: Security Scan
```bash
# Check for secrets in source files
grep -rn "sk-" --include="*.ts" --include="*.js" . 2>/dev/null | head -10
grep -rn "api_key\|password\|secret" --include="*.py" . 2>/dev/null | head -10
# Check for debug output left in
grep -rn "console\.log\|print(" src/ 2>/dev/null | head -10
```

### Phase 6: Diff Review
```bash
git diff --stat
git diff HEAD~1 --name-only
```
Review each changed file for unintended changes, missing error handling, and potential edge cases.

---

## Output Format

After running all phases, produce this report:

```
VERIFICATION REPORT
===================

Build:     [PASS/FAIL]
Types:     [PASS/FAIL] (X errors)
Lint:      [PASS/FAIL] (X warnings)
Tests:     [PASS/FAIL] (X/Y passed, Z% coverage)
Security:  [PASS/FAIL] (X issues)
Diff:      [X files changed]

Overall:   [READY / NOT READY] for PR

Issues to Fix:
1. ...
2. ...
```

---

## Common Failure Patterns

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Regression test works | Red-green cycle verified | Test passes once |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Requirements met | Line-by-line checklist | Tests passing |

---

## Key Patterns

**Tests:**
```
✅ [Run test command] → [See: 34/34 pass] → "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**Regression tests (TDD Red-Green):**
```
✅ Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
❌ "I've written a regression test" (without red-green verification)
```

**Build:**
```
✅ [Run build] → [See: exit 0] → "Build passes"
❌ "Linter passed" (linter doesn't check compilation)
```

**Requirements:**
```
✅ Re-read plan → Create checklist → Verify each item → Report gaps or completion
❌ "Tests pass, phase complete"
```

**Agent delegation:**
```
✅ Agent reports success → Check VCS diff → Verify changes → Report actual state
❌ Trust agent report at face value
```

---

## Red Flags — STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!")
- About to commit/push/PR without verification
- Trusting agent success reports without independent check
- Relying on partial verification
- Thinking "just this once"
- **ANY wording implying success without having run verification**

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence ≠ evidence |
| "Just this once" | No exceptions |
| "Linter passed" | Linter ≠ compiler |
| "Agent said success" | Verify independently |
| "I'm tired" | Exhaustion ≠ excuse |
| "Partial check is enough" | Partial proves nothing |
| "Different words so rule doesn't apply" | Spirit over letter |

---

## When to Apply

**ALWAYS before:**
- ANY completion or success claim
- ANY expression of satisfaction
- Committing, PR creation, task completion
- Moving to the next task
- Delegating to subagents

**Continuous Mode:** For long sessions, run verification after completing each function, finishing a component, or before switching context.

---

## The Bottom Line

Run the command. Read the output. THEN claim the result.

This is non-negotiable.
