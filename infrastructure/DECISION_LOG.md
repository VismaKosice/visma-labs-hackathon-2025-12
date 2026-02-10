# Decision Log -- Hackathon Design & Implementation

This document records all design decisions, discussions, and implementation changes made during the preparation of the Visma Performance Hackathon (Feb 2025). It serves as a reference for understanding why things are the way they are.

---

## Table of Contents

1. [Initial Review & Scope Assessment](#1-initial-review--scope-assessment)
2. [ID Strategy](#2-id-strategy)
3. [Mutation Ordering](#3-mutation-ordering)
4. [Ordinal Rank Removal](#4-ordinal-rank-removal)
5. [Dynamic Mutation Architecture](#5-dynamic-mutation-architecture)
6. [JSON Patch -- Core vs Bonus](#6-json-patch----core-vs-bonus)
7. [Tiered Structure (Core vs Bonus)](#7-tiered-structure-core-vs-bonus)
8. [Scoring System](#8-scoring-system)
9. [Mutation Redesign for Performance](#9-mutation-redesign-for-performance)
10. [Performance Guidance & Reference Tiers](#10-performance-guidance--reference-tiers)
11. [Testing Client PRD](#11-testing-client-prd)
12. [Numeric Precision](#12-numeric-precision)
13. [CRITICAL Failure Behavior](#13-critical-failure-behavior)
14. [Initial Situation `actual_at`](#14-initial-situation-actual_at)
15. [Negative Salary Handling](#15-negative-salary-handling)
16. [Projection Eligibility & Date Range](#16-projection-eligibility--date-range)
17. [Calculation ID Generation](#17-calculation-id-generation)
18. [External Scheme Registry (Bonus)](#18-external-scheme-registry-bonus)
19. [AI Code Review (Replacing Manual Review)](#19-ai-code-review-replacing-manual-review)
20. [Infrastructure & CI/CD](#20-infrastructure--cicd)
21. [Scoring Total Correction](#21-scoring-total-correction)
22. [API Spec Cleanup](#22-api-spec-cleanup)
23. [Message Codes](#23-message-codes)
24. [Complete Sample Request/Response](#24-complete-sample-requestresponse)
25. [Repository-per-Team Model](#25-repository-per-team-model)

---

## 1. Initial Review & Scope Assessment

**Problem:** The original assignment was reviewed for suitability as a single-day hackathon focused on "learning to write performant code." Several issues were identified:
- The scope was too large (dynamic mutation plugins, JSON Patch generation, full error handling)
- Performance focus was diluted by architectural complexity
- No concrete scoring system existed
- No performance baselines or guidance were provided
- Sample requests/responses were marked as TODO

**Decision:** Restructure the entire assignment into a tiered model (core + bonus) with clear scoring, performance-focused mutation logic, and comprehensive documentation.

---

## 2. ID Strategy

**Problem:** `dossier_id` was inconsistently defined -- UUID in the data model, alphanumeric max 10 chars in `create_dossier.json`. `person_id` origin was unclear.

**Options discussed:**
- A) Client-provided short IDs
- B) Client-provided UUIDs
- C) Server-generated UUIDs

**Decision:** Both `dossier_id` and `person_id` are **client-provided UUIDs**. This simplifies the engine (no ID generation logic) and makes test fixtures deterministic. Updated `create_dossier.json` to require both as UUID format, and added `person_id` to the required properties.

---

## 3. Mutation Ordering

**Problem:** The API spec said mutations are pre-sorted by `actual_at`, but the README implied the engine should sort them.

**Options discussed:**
- Engine sorts mutations (adds complexity, performance opportunity)
- Caller pre-sorts (simpler for engine)

**Decision:** Mutations are **pre-sorted by the caller**. The engine processes them in array order. Sorting was considered as a performance goal but rejected to keep the core simpler. Documented consistently across API spec and README.

---

## 4. Ordinal Rank Removal

**Problem:** Each mutation definition JSON had an unexplained `ordinal_rank` field (e.g., create_dossier=1000, add_policy=1100).

**Decision:** Removed `ordinal_rank` from all mutation definition files. Since mutations are pre-sorted by the caller, this field served no purpose and would confuse teams.

---

## 5. Dynamic Mutation Architecture

**Problem:** The original spec required a plugin-like architecture where mutations are dynamically loaded/resolved. This was the biggest scope item and had nothing to do with performance.

**Decision:** Removed the dynamic plugin requirement from core. Teams implement the 4 known mutation types directly. A **Clean Mutation Architecture bonus (4 pts)** rewards teams that use a registry/interface pattern, but it's not required for correctness.

---

## 6. JSON Patch -- Core vs Bonus

**Problem:** Generating forward and backward JSON Patch documents for every mutation is complex (RFC 6902 compliance, diff algorithms). It's more of an algorithmic challenge than a performance one, and it would consume significant time.

**Decision:** JSON Patch moved entirely to **bonus features**:
- Forward JSON Patch: 7 bonus points
- Backward JSON Patch: 4 bonus points (requires forward patch first)

Core response format no longer requires patch fields.

---

## 7. Tiered Structure (Core vs Bonus)

**Problem:** Everything was equally weighted, with no guidance on what to prioritize.

**Decision:** Clear two-tier structure:
- **Core:** 4 mutations (create_dossier, add_policy, apply_indexation, calculate_retirement_benefit), correct response format, Docker deployment, error handling
- **Bonus:** Forward/Backward JSON Patch, Clean Architecture, Cold Start, Scheme Registry Integration, project_future_benefits mutation

Teams are explicitly told: correctness first, then performance, then bonus.

---

## 8. Scoring System

**Problem:** No scoring system existed. Needed to incentivize correctness over performance, and reward bonus work.

**Discussion:** The user emphasized correctness should be highly valued. Performance points are contingent on correctness (if you fail a correctness test, you get 0 performance points for that category).

**Final scoring (115 points):**
- Correctness: 40 pts (10 test scenarios, binary pass/fail)
- Performance: 40 pts (relative scoring against other teams, only on passing tests)
- Bonus: 30 pts (Forward Patch 7, Backward Patch 4, Architecture 4, Cold Start 5, Scheme Registry 5, project_future_benefits 5)
- Code Quality: 5 pts (AI code review)

**Performance scoring:** Relative to the best team. Latency: `points * (fastest/yours)`. Throughput: `points * (yours/best)`.

**Cold start scoring:** Tiered thresholds instead of relative (to be fair across languages): <500ms=5pts, 500ms-1s=3pts, 1s-3s=1pt, >3s=0pts.

---

## 9. Mutation Redesign for Performance

**Problem:** Original mutations (create_dossier, add_policy, change_salary, calculate_retirement_benefit) had overlapping performance profiles. The user wanted each mutation to test a different aspect of performant code.

**Changes:**
- `change_salary` **replaced** with `apply_indexation` -- tests batch operations and efficient filtering (apply percentage to all matching policies with optional scheme_id and effective_before filters)
- `project_future_benefits` **added** as bonus -- tests caching and memoization (N dates * M policies, but intermediate values are reusable)
- `calculate_retirement_benefit` -- already tests computation and parallelism (per-policy calculations are independent)
- `add_policy` -- tests data structure choice (duplicate detection becomes hot path with many policies)
- `create_dossier` -- tests object allocation and initialization

**Performance aspects each mutation targets:**
1. create_dossier: Object allocation & initialization
2. add_policy: Data structure choice (lookups, duplicate detection)
3. apply_indexation: Batch operations & efficient filtering
4. calculate_retirement_benefit: Computation & parallelism
5. project_future_benefits (bonus): Caching & memoization

---

## 10. Performance Guidance & Reference Tiers

**Problem:** Docs said "optimize for performance" but gave no direction. Teams without performance engineering experience wouldn't know where to start.

**Decision:** Added two sections to README:
- **Performance Optimization Areas:** 8 specific areas (parallelism, data structures, batch ops, serialization, memory allocation, concurrency model, state management, external service I/O)
- **Performance Reference Tiers:** Rough benchmarks for simple (3 mutations) and complex (50+ mutations) requests, categorized as "competitive," "good," "needs work"

These are directions, not prescriptions -- discovering the right approach is part of the challenge.

---

## 11. Testing Client PRD

**Problem:** Need an automated tool to test team submissions for correctness, measure performance, and calculate scores. Samples alone aren't sufficient.

**Decision:** Created a comprehensive PRD at `testing-client/PRD.md` defining:
- TypeScript/Node.js stack with undici, autocannon, fast-json-patch, commander
- CLI interface with parameters (--target, --suite, --team, --output, --cold-start-image, --code-path)
- 10 correctness test scenarios with detailed validation rules
- 4 performance test categories (simple latency, complex latency, throughput, concurrency)
- Bonus test procedures (JSON Patch, project_future_benefits, Scheme Registry, cold start)
- Score calculation formulas
- Console + JSON output formats
- Multi-team leaderboard mode
- Test fixture JSON format specification

The testing client itself is to be **built in a separate session** from the PRD.

---

## 12. Numeric Precision

**Problem:** "Decimal years" calculation was ambiguous (days/365 vs days/365.25 vs calendar years). No rounding rules specified.

**Decision:**
- Years of service: `days_between(start, end) / 365.25` -- defined explicitly
- Monetary values: No specific rounding required (decimal numbers)
- Testing tolerance: **0.01** for all numeric comparisons

---

## 13. CRITICAL Failure Behavior

**Problem:** When a CRITICAL error occurs, the README said "halts processing immediately" but didn't specify what the response should contain.

**Discussion:** Considered whether this interacts with parallel processing. Conclusion: mutations are always sequential within a request, so CRITICAL is a clean chain break with no parallel processing conflict.

**Decision:**
- `mutations` array includes all mutations up to and **including** the one that produced CRITICAL. Remaining mutations are omitted.
- `end_situation` reflects the state **before** the failing mutation (since it didn't complete).
- If the first mutation fails, `end_situation.situation` = `{ "dossier": null }`.
- `end_situation.mutation_id` and `mutation_index` refer to the last **successfully applied** mutation. If none succeeded, use the first mutation's ID and index 0.

---

## 14. Initial Situation `actual_at`

**Problem:** The API spec requires `actual_at` on `initial_situation` but never defined what value to use.

**Decision:** Set to the `actual_at` of the **first mutation** in the request. Updated both API spec description and README.

---

## 15. Negative Salary Handling

**Problem:** `apply_indexation` with a large negative percentage could produce negative salaries.

**Options discussed:**
- A) Allow negative salaries
- B) Produce WARNING but allow
- C) Clamp to 0 with WARNING

**Decision:** **Option C** -- if `new_salary < 0`, clamp to `0` and produce a WARNING with code `NEGATIVE_SALARY_CLAMPED`. Negative salary doesn't make sense in the pension domain.

---

## 16. Projection Eligibility & Date Range

**Problem:** `project_future_benefits` uses the same formula as `calculate_retirement_benefit`, which has eligibility checks. Should projections enforce eligibility?

**Decision:** **Skip the eligibility check** for projections. They are hypothetical -- showing what the pension *would be*, not whether the participant *is eligible*. If eligibility were enforced, most projection dates would return 0, which is useless.

**Date range:** Start and end dates are both **inclusive**. Explicitly stated in the README.

---

## 17. Calculation ID Generation

**Problem:** The response requires a `calculation_id` but it wasn't stated who generates it.

**Decision:** The engine generates a unique `calculation_id` (UUID v4) for each request. Added to README and API spec description.

---

## 18. External Scheme Registry (Bonus)

**Problem:** The user asked about adding a performance trial involving third-party service calls with simulated delay.

**Discussion:** Pros: tests real-world async I/O, caching, connection pooling. Cons: adds complexity, shifts focus to framework knowledge, could be a time sink. Initially recommended against, but the user decided to include it given that AI tooling is allowed.

**Decision:** Added as a **bonus feature (5 pts)**:
- Activated via `SCHEME_REGISTRY_URL` environment variable
- Engine calls `GET {url}/schemes/{scheme_id}` to fetch `accrual_rate`
- Mock responds with `{ "accrual_rate": 0.025 }` after ~50ms delay
- When env var is not set, use hardcoded `0.02` (core tests unaffected)
- Self-verifying: bonus tests expect results computed with 0.025
- Graceful fallback: timeout after 2s, use default 0.02

Performance aspects: caching (same scheme_id = same response), parallel I/O (multiple schemes concurrently), connection pooling.

---

## 19. AI Code Review (Replacing Manual Review)

**Problem:** Code Quality (5 pts) and Clean Mutation Architecture (4 pts) were originally scored by manual review. The user wanted to automate this.

**Decision:** Created `testing-client/ai-code-review-prompt.md` with a structured AI prompt that scores:
- Code Quality (5 pts): Readability & organization (2), error handling (1.5), project structure (1.5)
- Clean Architecture (4 pts): Common interface (1), per-mutation implementation (1), generic dispatch (1), extensibility (1)

**Consistency measures:**
- Run twice per submission at temperature = 0
- If scores differ by >1.5 points, run a third time and take the median
- Same model and prompt version for all teams

Result: **zero manual scoring items** -- everything is automated.

---

## 20. Infrastructure & CI/CD *(superseded by Decision #25 -- see below)*

**Problem:** Needed a complete workflow for teams to submit solutions and organizers to test them.

**Decisions:**

**Repository strategy:** Single repo with team branches.
- `main` branch: assignment docs (read-only for teams)
- `teams/{name}` branches: one per team, created from main
- Teams can see each other's code (acceptable for a hackathon)

**CI/CD:** GitHub Actions workflow (`.github/workflows/build-team.yml`):
- Triggers on push to `teams/*` branches
- Builds Docker image from Dockerfile in repo root
- Pushes to GitHub Container Registry (ghcr.io) -- free, tightly integrated
- Tags: `latest` + `sha-{short_hash}`
- Runs a health check (starts container, sends a basic request, checks for HTTP 200)

**Container Registry:** GHCR over ACR -- simpler, free, no Azure setup needed for CI.

**Testing infrastructure:** Single Azure VM (Standard_D4s_v5) running tests sequentially.
- Sequential testing guarantees fair performance comparison (same hardware, no noisy neighbors)
- VM pulls team images from GHCR, runs testing client, saves JSON results
- Estimated cost: ~$2 for the day

**Files created:**
- `.github/workflows/build-team.yml` -- CI pipeline
- `SUBMISSION.md` -- team-facing submission guide
- `infrastructure/README.md` -- Azure deployment guide
- `infrastructure/setup-vm.sh` -- VM setup script
- `infrastructure/run-all-teams.sh` -- test orchestrator
- `infrastructure/create-team-branches.sh` -- branch creation script
- `infrastructure/CHECKLIST.md` -- organizer pre/during/post hackathon checklist
- `.gitignore` -- standard ignores

---

## 21. Scoring Total Correction

**Problem:** After adding the Scheme Registry bonus (5 pts), the bonus total became 30 but the overall total wasn't updated. 40+40+30+5 = 115, but docs said 110.

**Decision:** Fixed to **115 points** everywhere (README, INDEX, QUICK_START, PRD, JSON output examples).

Also fixed: PRD correctness test points summed to 38 instead of 40 (C05 and C06 bumped from 2 to 3 pts each).

---

## 22. API Spec Cleanup

**Problem:** The API spec contained many fields that weren't relevant to the hackathon challenge, adding unnecessary complexity.

**Fields removed from request:**
- `correlation_id` -- request tracking, not used by any mutation or test

**Fields removed from response:**
- `correlation_id` (calculation_metadata) -- echo of unused field
- `dossier_id` (calculation_metadata) -- redundant with end_situation
- `source_mutation_id` (CalculationMessage) -- redundant with calculation_message_indexes
- `source_mutation_index` (CalculationMessage) -- same redundancy
- `PARTNER` role enum value -- out of scope, only PARTICIPANT is used
- `relationship_start_date` (Person) -- always null, not used
- `relationship_end_date` (Person) -- always null, not used

**ErrorResponse simplified:** Removed `developer_message`, `validation_messages`, `error_code`, `correlation_id`. Now just `status` (int) + `message` (string).

**Updated across:** api-spec.yaml, data-model.md (diagram, descriptions, validation rules), README (sample response, create_dossier), testing-client PRD (validation checks, fixtures).

---

## 23. Message Codes

**Problem:** The API spec had a `code` field on CalculationMessage but expected values were never defined. Teams would invent different codes, and the testing client wouldn't know what to match.

**Decision:** Added a `Code` column to every mutation's validation table in the README:

| Code | Used By | Level |
|---|---|---|
| `DOSSIER_ALREADY_EXISTS` | create_dossier | CRITICAL |
| `INVALID_BIRTH_DATE` | create_dossier | CRITICAL |
| `INVALID_NAME` | create_dossier | CRITICAL |
| `DOSSIER_NOT_FOUND` | add_policy, apply_indexation, calculate_retirement_benefit, project_future_benefits | CRITICAL |
| `INVALID_SALARY` | add_policy | CRITICAL |
| `INVALID_PART_TIME_FACTOR` | add_policy | CRITICAL |
| `DUPLICATE_POLICY` | add_policy | WARNING |
| `NO_POLICIES` | apply_indexation, calculate_retirement_benefit, project_future_benefits | CRITICAL |
| `NO_MATCHING_POLICIES` | apply_indexation | WARNING |
| `NEGATIVE_SALARY_CLAMPED` | apply_indexation | WARNING |
| `NOT_ELIGIBLE` | calculate_retirement_benefit | CRITICAL |
| `RETIREMENT_BEFORE_EMPLOYMENT` | calculate_retirement_benefit | WARNING |
| `INVALID_DATE_RANGE` | project_future_benefits | CRITICAL |
| `PROJECTION_BEFORE_EMPLOYMENT` | project_future_benefits | WARNING |

---

## 24. Complete Sample Request/Response

**Problem:** No concrete worked example existed. Teams had to piece together the expected behavior from multiple documents.

**Decision:** Added a complete example to the README showing a 3-mutation request (create_dossier + add_policy + apply_indexation) with the full expected response, including all fields (metadata, messages, initial_situation, mutations array, end_situation with dossier, person, and policy).

Key verification points highlighted: salary after indexation (50000 * 1.03 = 51500), policy_id format, null initial situation, mutation_index, empty messages array.

---

## 25. Repository-per-Team Model

**Problem:** The original design used a single repository with one branch per team (`teams/alpha`, `teams/beta`, etc.). This had several drawbacks:
- Teams could see each other's code by switching branches
- All teams needed push access to the same repository (complex permissions)
- CI pipeline triggered on all `teams/*` branches in one repo
- Branch proliferation made the repo harder to manage

**Options discussed:**
- A) Keep branch-per-team (status quo)
- B) Separate repository per team, created from a GitHub template

**Decision:** **Option B** -- each team gets their own repository, created from this repo as a GitHub template. Changes:

1. This repo becomes a **GitHub template repository**. It contains assignment docs, testing client, and infrastructure.
2. Each team repo is created via `create-team-repos.sh` (uses `gh repo create --template`).
3. Team repos start as full copies of the template (docs + API spec + mutation definitions).
4. A **`infrastructure/teams.json`** config file maps team names to repo URLs.
5. `run-all-teams.sh` reads `teams.json` instead of accepting `--repo-url` and `--teams` arguments.
6. Teams push to `main` in their own repo (no branch juggling).

**Benefits:**
- **Isolation:** teams cannot see each other's code
- **Simpler permissions:** each team only needs access to their own repo
- **Cleaner workflow:** teams just clone, code, push to `main` -- no branch confusion
- **No CI needed:** Docker images are built locally on the test VM from cloned source

**Files changed:**
- Deleted: `infrastructure/create-team-branches.sh`, `.github/workflows/build-team.yml`
- Created: `infrastructure/create-team-repos.sh`, `infrastructure/teams.json`
- Updated: `infrastructure/run-all-teams.sh`, `SUBMISSION.md`, `QUICK_START.md`, `INDEX.md`, `infrastructure/README.md`, `infrastructure/CHECKLIST.md`

---

## Remaining Open Items

1. **Testing client application** -- PRD written, implementation needed in a separate session
2. **Scheme Registry mock service** -- part of the testing client build
3. **Live leaderboard UI** -- deferred for feasibility assessment (would read from JSON result files)
