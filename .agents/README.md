# .agents — Unified AI Agent Boilerplate

Consolidated agent definitions, rules, skills, and workflows for Claude Code.
Curated from `everything-claude-code`, `superpowers`, and `awesome-claude-skills`.

**Focus domains:** Python · Web (TypeScript / React / Next.js / Go / Rust) · Data Analysis · Academic Research · Engineering & Math

**Excluded:** PHP · Ruby · Kotlin · Swift · Android · Perl · Laravel · C++ · C#

---

## Directory Tree

```
.agents/
├── README.md
├── core/
│   └── agents/                        (19 agent definitions)
│       ├── architect.md
│       ├── planner.md
│       ├── code-reviewer.md
│       ├── tdd-guide.md
│       ├── security-reviewer.md
│       ├── database-reviewer.md
│       ├── e2e-runner.md
│       ├── refactor-cleaner.md
│       ├── doc-updater.md
│       ├── docs-lookup.md
│       ├── python-reviewer.md
│       ├── typescript-reviewer.md
│       ├── go-reviewer.md
│       ├── rust-reviewer.md
│       ├── build-error-resolver.md
│       ├── go-build-resolver.md
│       ├── rust-build-resolver.md
│       ├── loop-operator.md
│       └── harness-optimizer.md
├── rules/
│   ├── common/                        (9 universal rules — always active)
│   │   ├── agents.md
│   │   ├── coding-style.md
│   │   ├── development-workflow.md
│   │   ├── git-workflow.md
│   │   ├── hooks.md
│   │   ├── patterns.md
│   │   ├── performance.md
│   │   ├── security.md
│   │   └── testing.md
│   ├── python/   (coding-style · hooks · patterns · security · testing)
│   ├── typescript/ (coding-style · hooks · patterns · security · testing)
│   ├── golang/   (coding-style · hooks · patterns · security · testing)
│   └── rust/     (coding-style · hooks · patterns · security · testing)
├── skills/
│   ├── engineering/                   (17 items — 14 .md + 3 directories)
│   │   ├── api-design.md
│   │   ├── backend-patterns.md
│   │   ├── frontend-patterns.md
│   │   ├── coding-standards.md
│   │   ├── security-review.md
│   │   ├── e2e-testing.md
│   │   ├── architecture-decision-records.md
│   │   ├── docker-patterns.md
│   │   ├── deployment-patterns.md
│   │   ├── postgres-patterns.md
│   │   ├── database-migrations.md
│   │   ├── mcp-server-patterns.md
│   │   ├── nextjs-turbopack.md
│   │   ├── eval-harness.md
│   │   ├── webapp-testing/            (Python Playwright + scripts)
│   │   ├── mcp-builder/               (Python FastMCP + Node MCP + scripts)
│   │   └── artifacts-builder/         (React/Tailwind artifact bundler + scripts)
│   ├── python/                        (6 files)
│   │   ├── python-patterns.md
│   │   ├── python-testing.md
│   │   ├── django-patterns.md
│   │   ├── django-tdd.md
│   │   ├── django-security.md
│   │   └── django-verification.md
│   ├── go-rust/                       (4 files)
│   │   ├── golang-patterns.md
│   │   ├── golang-testing.md
│   │   ├── rust-patterns.md
│   │   └── rust-testing.md
│   ├── data-research/                 (11 files)
│   │   ├── deep-research.md
│   │   ├── market-research.md
│   │   ├── documentation-lookup.md
│   │   ├── exa-search.md
│   │   ├── data-scraper-agent.md
│   │   ├── content-research-writer.md
│   │   ├── developer-growth-analysis.md
│   │   ├── meeting-insights-analyzer.md
│   │   ├── langsmith-fetch.md
│   │   ├── lead-research-assistant.md
│   │   └── changelog-generator.md
│   └── workflow/                      (14 files — 2 are merged originals)
│       ├── brainstorming.md
│       ├── systematic-debugging.md
│       ├── tdd-workflow.md            ★ merged
│       ├── verification.md            ★ merged
│       ├── writing-plans.md
│       ├── executing-plans.md
│       ├── subagent-driven-development.md
│       ├── dispatching-parallel-agents.md
│       ├── requesting-code-review.md
│       ├── receiving-code-review.md
│       ├── using-git-worktrees.md
│       ├── finishing-a-development-branch.md
│       ├── root-cause-tracing.md
│       └── testing-anti-patterns.md
└── workflows/                         (13 orchestration prompt files)
    ├── brainstorming.md
    ├── brainstorming-visual-companion.md
    ├── spec-document-reviewer-prompt.md
    ├── plan-writing.md
    ├── plan-document-reviewer-prompt.md
    ├── subagent-driven-development.md
    ├── implementer-prompt.md
    ├── spec-reviewer-prompt.md
    ├── code-quality-reviewer-prompt.md
    ├── requesting-code-review.md
    ├── code-reviewer-dispatch-prompt.md
    ├── systematic-debugging.md
    └── defense-in-depth.md
```

---

## core/agents/ — Agent Definitions

| Agent | Purpose |
|---|---|
| `architect.md` | System design and architectural decisions for new systems |
| `planner.md` | Break down features into bite-sized implementation tasks |
| `code-reviewer.md` | Confidence-filtered code quality and security review via git diff |
| `tdd-guide.md` | Enforce test-driven development and Red-Green-Refactor cycle |
| `security-reviewer.md` | Detect vulnerabilities, OWASP Top 10, secrets, injection risks |
| `database-reviewer.md` | PostgreSQL schema optimization, indexing, migration safety |
| `e2e-runner.md` | Generate and run E2E tests with Playwright |
| `refactor-cleaner.md` | Remove dead code, deduplicate, improve naming without behavior change |
| `doc-updater.md` | Keep documentation and codemaps in sync with code changes |
| `docs-lookup.md` | Fetch live library documentation via Context7 MCP |
| `python-reviewer.md` | Python-specific code review (style, typing, idioms) |
| `typescript-reviewer.md` | TypeScript/JS code review (types, patterns, bundle impact) |
| `go-reviewer.md` | Go code review (concurrency, error handling, idiomatic Go) |
| `rust-reviewer.md` | Rust code review (ownership, lifetimes, unsafe blocks) |
| `build-error-resolver.md` | Diagnose and fix TypeScript/JS build failures |
| `go-build-resolver.md` | Diagnose and fix Go build and module errors |
| `rust-build-resolver.md` | Diagnose and fix Rust compilation and Cargo errors |
| `loop-operator.md` | Monitor and manage autonomous agent loops |
| `harness-optimizer.md` | Configure and tune the agent harness for cost and performance |

---

## rules/ — Always-On Guidelines

### common/ (apply to every project)

| File | Role |
|---|---|
| `agents.md` | Agent orchestration reference and delegation patterns |
| `coding-style.md` | Immutability, file size limits, naming conventions |
| `development-workflow.md` | Research → plan → TDD → review pipeline |
| `git-workflow.md` | Conventional commits, PR workflow, branch strategy |
| `hooks.md` | PreToolUse / PostToolUse / Stop hook types and usage |
| `patterns.md` | Repository pattern, skeleton project structure |
| `performance.md` | Model selection strategy, context budget management |
| `security.md` | Mandatory pre-commit security checklist |
| `testing.md` | TDD requirement, 80% coverage mandate, test type hierarchy |

### Language rules (5 files each)
Each language folder (`python/`, `typescript/`, `golang/`, `rust/`) contains:
`coding-style.md` · `hooks.md` · `patterns.md` · `security.md` · `testing.md`

---

## skills/engineering/ — Core Engineering

| Skill | Description |
|---|---|
| `api-design.md` | RESTful and GraphQL API design patterns and contracts |
| `backend-patterns.md` | Server-side architecture patterns (services, repos, DI) |
| `frontend-patterns.md` | Component architecture, state management, rendering patterns |
| `coding-standards.md` | Cross-language coding standards and conventions |
| `security-review.md` | Security audit checklist for code and dependencies |
| `e2e-testing.md` | Playwright E2E patterns, Page Object Model, CI integration |
| `architecture-decision-records.md` | Write and maintain ADRs for architectural choices |
| `docker-patterns.md` | Dockerfile best practices, multi-stage builds, compose patterns |
| `deployment-patterns.md` | CI/CD, blue-green deploys, rollback strategies |
| `postgres-patterns.md` | PostgreSQL query optimization, indexing, schema design |
| `database-migrations.md` | Safe migration strategies, rollback, zero-downtime deploys |
| `mcp-server-patterns.md` | TypeScript/Node MCP server SDK patterns and tool definitions |
| `nextjs-turbopack.md` | Next.js with Turbopack — routing, RSC, optimization |
| `eval-harness.md` | Build evaluation harnesses for LLM output quality |
| `webapp-testing/` | Python Playwright web app testing with helper scripts |
| `mcp-builder/` | Python FastMCP and Node MCP server dev guide with scripts |
| `artifacts-builder/` | React/Tailwind Claude artifact bundler with scripts |

---

## skills/python/ — Python & Django

| Skill | Description |
|---|---|
| `python-patterns.md` | Idiomatic Python: typing, dataclasses, async, context managers |
| `python-testing.md` | pytest patterns, fixtures, parametrize, coverage configuration |
| `django-patterns.md` | Django ORM, views, serializers, and project structure |
| `django-tdd.md` | TDD workflow specifically for Django (models, views, APIs) |
| `django-security.md` | Django security checklist: CSRF, XSS, SQL injection, auth |
| `django-verification.md` | Django verification loop: lint, type, test, coverage |

---

## skills/go-rust/ — Go & Rust

| Skill | Description |
|---|---|
| `golang-patterns.md` | Idiomatic Go: interfaces, goroutines, channels, error handling |
| `golang-testing.md` | Go testing patterns: table tests, subtests, benchmarks, mocks |
| `rust-patterns.md` | Idiomatic Rust: ownership, traits, error handling with `?` |
| `rust-testing.md` | Rust testing: unit tests, integration tests, doc tests |

---

## skills/data-research/ — Research & Data Analysis

| Skill | Description | External Dependencies |
|---|---|---|
| `deep-research.md` | Multi-source synthesis via MCP tools for business intelligence | Context7 MCP |
| `market-research.md` | Competitive analysis, market sizing, investor due diligence | — |
| `documentation-lookup.md` | Live library docs lookup via Context7 MCP | Context7 MCP |
| `exa-search.md` | Neural web search via Exa for technical and research queries | Exa API key |
| `data-scraper-agent.md` | Autonomous web scraping agent with structured output | — |
| `content-research-writer.md` | Academic-style research with citations, outlines, and drafts | — |
| `developer-growth-analysis.md` | Coding pattern analysis and learning resource curation | — |
| `meeting-insights-analyzer.md` | Transcript analysis for communication patterns and action items | — |
| `langsmith-fetch.md` | LangChain/LangGraph debugging via LangSmith traces (Python) | LangSmith API key |
| `lead-research-assistant.md` | B2B lead identification and business profile research | — |
| `changelog-generator.md` | Auto-generate user-facing changelogs from git commit history | — |

---

## skills/workflow/ — Process Methodology

| Skill | Description |
|---|---|
| `brainstorming.md` | Turn ideas into fully formed specs through collaborative dialogue |
| `systematic-debugging.md` | Find root cause before attempting fixes; diagnose before acting |
| `tdd-workflow.md` ★ | Red-Green-Refactor with 80%+ coverage; merged from 2 sources |
| `verification.md` ★ | 6-phase verification gate; evidence before completion claims |
| `writing-plans.md` | Write comprehensive implementation plans with bite-sized tasks |
| `executing-plans.md` | Load plan, review critically, execute all tasks in order |
| `subagent-driven-development.md` | Execute plans by dispatching fresh subagents per task |
| `dispatching-parallel-agents.md` | Delegate independent tasks to specialized agents simultaneously |
| `requesting-code-review.md` | Dispatch code-reviewer subagent before merging |
| `receiving-code-review.md` | Verify code review feedback before implementing suggestions |
| `using-git-worktrees.md` | Create isolated workspaces sharing the same repository |
| `finishing-a-development-branch.md` | Guide completion of development work with merge/PR options |
| `root-cause-tracing.md` | Companion reference for systematic-debugging root cause analysis |
| `testing-anti-patterns.md` | Avoid mocking real behavior, test-only methods, and mock-without-understanding |

★ = merged from multiple sources

---

## workflows/ — Multi-Step Orchestration Prompts

These are structured prompt files for chaining agents into complete pipelines.

| File | What it orchestrates |
|---|---|
| `brainstorming.md` | Ideation → spec → reviewer loop |
| `brainstorming-visual-companion.md` | Visual design companion for brainstorming sessions |
| `spec-document-reviewer-prompt.md` | Subagent prompt: review a spec document for completeness |
| `plan-writing.md` | Research → plan → document workflow |
| `plan-document-reviewer-prompt.md` | Subagent prompt: review a plan for clarity and executability |
| `subagent-driven-development.md` | Dispatch implementer → spec reviewer → code quality reviewer chain |
| `implementer-prompt.md` | Subagent prompt: implement one task from a plan |
| `spec-reviewer-prompt.md` | Subagent prompt: review implementation against original spec |
| `code-quality-reviewer-prompt.md` | Subagent prompt: review code quality before merge |
| `requesting-code-review.md` | How to dispatch a code-reviewer and interpret results |
| `code-reviewer-dispatch-prompt.md` | Subagent prompt: perform a focused code review |
| `systematic-debugging.md` | Diagnose → hypothesize → verify → fix debugging pipeline |
| `defense-in-depth.md` | Multi-layer defensive coding strategies for robust systems |

---

## Sources

| Repository | Contribution |
|---|---|
| `everything-claude-code/` | 29 rules (common + 4 languages), 19 agents, 35 skills |
| `superpowers/` | 12 workflow skills, 13 orchestration prompt files |
| `awesome-claude-skills/` | 9 research/data/tooling skills (3 with scripts) |
| `claude-cookbooks/` | Not included — kept as reference library in root |

**File count:** 132 total files (19 agents + 29 rules + 35 engineering skills + 6 python + 4 go-rust + 11 data-research + 14 workflow + 13 workflows + 1 README).
The directory tree shows `skills/engineering/` as "17 items (14 .md + 3 directories)" — the 3 subdirectories each contain additional files (scripts, references, LICENSE): 21 extra files bring the actual engineering total to 35.

---

## Deduplication Decisions

| Topic | Resolution |
|---|---|
| **TDD** | `tdd-workflow.md` merges superpowers (enforcement) + ECC (coverage, tooling, E2E patterns) |
| **Verification** | `verification.md` merges superpowers (Iron Law) + ECC (6-phase checklist, output format) |
| **Code Review (agent)** | ECC `code-reviewer.md` wins — confidence-filtered, git diff-based; superpowers dispatch logic preserved in `workflows/code-reviewer-dispatch-prompt.md` |
| **Deep vs Content Research** | Both kept — complementary (MCP synthesis vs. academic writing) |
| **E2E vs Webapp Testing** | Both kept — complementary (patterns/architecture vs. Python execution) |
| **MCP Server vs MCP Builder** | Both kept — complementary (TypeScript patterns vs. Python FastMCP) |
