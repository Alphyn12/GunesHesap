---
name: tdd-workflow
description: Use when implementing any feature, bugfix, or refactor — before writing implementation code. Enforces Red-Green-Refactor with 80%+ coverage across unit, integration, and E2E tests.
origin: merged (superpowers/test-driven-development + ECC/tdd-workflow)
---

# Test-Driven Development Workflow

## Overview

Write the test first. Watch it fail. Write minimal code to pass.

**Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.

**Violating the letter of the rules is violating the spirit of the rules.**

## When to Activate

**Always:**
- New features or functionality
- Bug fixes
- Refactoring existing code
- Adding API endpoints
- Creating new components
- Behavior changes

**Exceptions (ask your human partner):**
- Throwaway prototypes
- Generated code
- Configuration files

Thinking "skip TDD just this once"? Stop. That's rationalization.

---

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? Delete it. Start over.

**No exceptions:**
- Don't keep it as "reference"
- Don't "adapt" it while writing tests
- Don't look at it
- Delete means delete

Implement fresh from tests. Period.

---

## Red-Green-Refactor Cycle

```
RED   → Write one failing test for one behavior
      → Verify it fails for the RIGHT reason
GREEN → Write the minimal code to pass (no over-engineering)
      → Verify it passes AND others still green
REFACTOR → Clean up (names, duplication, helpers)
         → Keep all tests green
REPEAT → Next behavior, next failing test
```

### RED — Write Failing Test

Write one minimal test showing what should happen.

**Good:**
```typescript
test('retries failed operations 3 times', async () => {
  let attempts = 0;
  const operation = () => {
    attempts++;
    if (attempts < 3) throw new Error('fail');
    return 'success';
  };
  const result = await retryOperation(operation);
  expect(result).toBe('success');
  expect(attempts).toBe(3);
});
```
_Clear name, tests real behavior, one thing._

**Bad:**
```typescript
test('retry works', async () => {
  const mock = jest.fn()
    .mockRejectedValueOnce(new Error())
    .mockResolvedValueOnce('success');
  await retryOperation(mock);
  expect(mock).toHaveBeenCalledTimes(3);
});
```
_Vague name, tests mock not code._

Requirements: one behavior, clear name, real code (no mocks unless unavoidable).

### Verify RED — Watch It Fail (MANDATORY. Never skip.)

```bash
npm test path/to/test.test.ts   # or: pytest tests/test_foo.py
```

Confirm:
- Test **fails** (not errors)
- Failure message is expected
- Fails because **feature is missing** (not a typo)

**Test passes immediately?** You're testing existing behavior. Fix the test.
**Test errors?** Fix the error, re-run until it fails correctly.

### GREEN — Minimal Code

Write the simplest code to pass the test. Nothing more.

Don't add features, refactor other code, or "improve" beyond the test.

### Verify GREEN — Watch It Pass (MANDATORY.)

```bash
npm test path/to/test.test.ts
```

- Test passes
- Other tests still pass
- Output pristine (no errors, warnings)

### REFACTOR — Clean Up

After green only: remove duplication, improve names, extract helpers. Keep tests green. Don't add behavior.

---

## Coverage Requirements

| Type | Target |
|---|---|
| Branches | 80% minimum |
| Functions | 80% minimum |
| Lines | 80% minimum |
| Statements | 80% minimum |

### Test Types

**Unit Tests** — Individual functions, component logic, pure functions, helpers.

**Integration Tests** — API endpoints, database operations, service interactions, external API calls.

**E2E Tests (Playwright/pytest)** — Critical user flows, complete workflows, browser/UI interactions.

### Coverage Configuration

```json
{
  "jest": {
    "coverageThresholds": {
      "global": { "branches": 80, "functions": 80, "lines": 80, "statements": 80 }
    }
  }
}
```

```bash
npm run test:coverage       # TypeScript/JS
pytest --cov=src --cov-report=term-missing  # Python
```

---

## Tooling Patterns

### Unit Test — Jest/Vitest (TypeScript)
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button Component', () => {
  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### Unit Test — pytest (Python)
```python
def test_retries_failed_operation_three_times():
    attempts = 0
    def operation():
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise ValueError("fail")
        return "success"
    result = retry_operation(operation)
    assert result == "success"
    assert attempts == 3
```

### API Integration Test
```typescript
describe('GET /api/markets', () => {
  it('returns markets successfully', async () => {
    const response = await GET(new NextRequest('http://localhost/api/markets'));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
  });
  it('validates query parameters', async () => {
    const response = await GET(new NextRequest('http://localhost/api/markets?limit=invalid'));
    expect(response.status).toBe(400);
  });
});
```

### E2E Test — Playwright
```typescript
test('user can search and filter markets', async ({ page }) => {
  await page.goto('/markets');
  await page.fill('input[placeholder="Search markets"]', 'election');
  await page.waitForTimeout(600);
  const results = page.locator('[data-testid="market-card"]');
  await expect(results).toHaveCount(5, { timeout: 5000 });
});
```

---

## File Organization

```
src/
├── components/Button/
│   ├── Button.tsx
│   └── Button.test.tsx          # unit tests co-located
├── app/api/markets/
│   ├── route.ts
│   └── route.test.ts            # integration tests co-located
└── e2e/
    ├── markets.spec.ts
    └── auth.spec.ts             # E2E tests separate
```

---

## Continuous Testing

```bash
npm test -- --watch              # watch mode during development
pytest -f                        # pytest equivalent
```

**Pre-commit:** `npm test && npm run lint`

**CI/CD:**
```yaml
- name: Run Tests
  run: npm test -- --coverage
- name: Upload Coverage
  uses: codecov/codecov-action@v3
```

---

## Verification Checklist

Before marking work complete:

- [ ] Every new function/method has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for the expected reason (feature missing, not typo)
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass
- [ ] Output pristine (no errors, warnings)
- [ ] Tests use real code (mocks only if unavoidable)
- [ ] Edge cases and error paths covered
- [ ] 80%+ coverage verified

Can't check all boxes? You skipped TDD. Start over.

---

## Red Flags — STOP and Start Over

- Code written before test
- Test passes immediately on first run
- Can't explain why the test failed
- Tests added "later" or "after"
- Rationalizing "just this once"
- "I already manually tested it"
- "Tests after achieve the same purpose"
- "Keep as reference" or "adapt existing code"
- "Already spent X hours, deleting is wasteful"
- "TDD is dogmatic, I'm being pragmatic"
- "This is different because..."

**All of these mean: Delete the code. Start over with TDD.**

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll test after" | Tests passing immediately prove nothing. |
| "Tests after achieve same goals" | Tests-after = "what does this do?" Tests-first = "what should this do?" |
| "Already manually tested" | Ad-hoc ≠ systematic. No record, can't re-run. |
| "Deleting X hours is wasteful" | Sunk cost fallacy. Unverified code is technical debt. |
| "TDD will slow me down" | TDD is faster than debugging in production. |

## When Stuck

| Problem | Solution |
|---------|----------|
| Don't know how to test | Write wished-for API. Write assertion first. Ask your human partner. |
| Test too complicated | Design too complicated. Simplify interface. |
| Must mock everything | Code too coupled. Use dependency injection. |
| Test setup huge | Extract helpers. Still complex? Simplify design. |

---

## Final Rule

```
Production code → test exists and failed first
Otherwise → not TDD
```

No exceptions without your human partner's permission.

> See also: `testing-anti-patterns.md` — avoid mocking real behavior, test-only production methods, and mock-without-understanding pitfalls.
