# Testing Client - Product Requirements Document

## Overview

A command-line testing client application for the Visma Performance Hackathon. It validates the correctness and measures the performance of team submissions (pension calculation engines), calculates scores according to the hackathon scoring system, and outputs results in a format suitable for leaderboard display.

## Context

- **Hackathon date:** 11.02.2026
- **What teams build:** A Docker-containerized HTTP API (`POST /calculation-requests`) that processes pension calculation mutations
- **What this tool does:** Tests those APIs for correctness, measures performance, and calculates scores
- **Scoring system:** 115 points total (40 correctness + 40 performance + 30 bonus + 5 AI code quality review)
- **Full hackathon spec:** See `../README.md`, `../api-spec.yaml`, `../data-model.md`, and `../mutation-definitions/`

## Technology Choice

**Recommended: TypeScript (Node.js) with the following stack:**
- **Runtime:** Node.js 20+
- **Language:** TypeScript
- **HTTP client:** `undici` (high-performance HTTP/1.1 client built into Node.js) or `axios` for simplicity
- **Load testing:** `autocannon` (Node.js HTTP benchmarking tool, handles throughput and concurrency measurement)
- **JSON Patch:** `fast-json-patch` (RFC 6902 implementation for validating bonus JSON Patch output)
- **CLI framework:** `commander` or `yargs`
- **Test fixtures:** JSON files in a `fixtures/` directory
- **Output:** Console (human-readable) + JSON file (machine-readable, for leaderboard)

**Rationale:** TypeScript gives type safety for the complex request/response structures, the Node.js ecosystem has mature HTTP benchmarking tools (`autocannon`), and `fast-json-patch` handles RFC 6902 validation without building it from scratch.

## CLI Interface

### Usage

```bash
# Run all tests against a target
npx ts-node src/index.ts --target http://localhost:8080

# Run only correctness tests
npx ts-node src/index.ts --target http://localhost:8080 --suite correctness

# Run only performance tests
npx ts-node src/index.ts --target http://localhost:8080 --suite performance

# Run only bonus tests
npx ts-node src/index.ts --target http://localhost:8080 --suite bonus

# Run all tests and output results to JSON file
npx ts-node src/index.ts --target http://localhost:8080 --output results.json

# Run with a team name (for leaderboard)
npx ts-node src/index.ts --target http://localhost:8080 --team "Team Alpha" --output results.json

# Cold start test (requires docker image name)
npx ts-node src/index.ts --target http://localhost:8080 --cold-start-image my-team:latest

# AI code review (requires path to team's source code)
npx ts-node src/index.ts --target http://localhost:8080 --code-path /path/to/team/repo
```

### Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `--target <url>` | Yes | - | Base URL of the team's API (e.g., `http://localhost:8080`) |
| `--suite <name>` | No | `all` | Which test suite to run: `all`, `correctness`, `performance`, `bonus` |
| `--output <path>` | No | - | Path to write JSON results file (for leaderboard consumption) |
| `--team <name>` | No | `"unnamed"` | Team name (included in output for leaderboard) |
| `--cold-start-image <image>` | No | - | Docker image name for cold start testing. If not provided, cold start test is skipped. |
| `--code-path <path>` | No | - | Path to team's source code for AI code review. If not provided, code quality and clean architecture scores are 0. |
| `--verbose` | No | `false` | Show detailed output including request/response bodies for failed tests |
| `--warmup-requests` | No | `10` | Number of warmup requests before performance measurement |
| `--throughput-duration` | No | `30` | Duration in seconds for throughput test |
| `--concurrency-level` | No | `50` | Number of concurrent connections for concurrency test |

## Functional Requirements

### FR-1: Health Check

Before running any tests, the client must verify the target is reachable.

- Send a `POST /calculation-requests` with a minimal valid request (single `create_dossier` mutation)
- If no response within 10 seconds, report target as unreachable and abort
- If response received (any status code), proceed with tests

### FR-2: Correctness Test Suite

Run predefined test scenarios and validate the responses. Each scenario is a JSON fixture consisting of a request and expected response.

**Test scenarios (10 total, 40 points):**

| ID | Scenario | Points | Description |
|---|---|---|---|
| `C01` | `create_dossier` only | 4 | Single dossier creation. Validate dossier fields, person fields, status = ACTIVE, empty policies. |
| `C02` | `create_dossier` + `add_policy` (single) | 4 | One policy added. Validate policy_id format (`{dossier_id}-1`), all policy fields. |
| `C03` | `create_dossier` + `add_policy` (multiple) | 4 | 3+ policies added. Validate sequential policy_id generation (`-1`, `-2`, `-3`). |
| `C04` | `add_policy` + `apply_indexation` (no filters) | 4 | Apply 3% indexation to all policies. Validate all salaries updated correctly. |
| `C05` | `apply_indexation` with `scheme_id` filter | 3 | Apply indexation only to policies with matching scheme_id. Validate only matching policies updated. |
| `C06` | `apply_indexation` with `effective_before` filter | 3 | Apply indexation only to policies with employment_start_date before the given date. |
| `C07` | Full happy path | 6 | create_dossier + multiple add_policy + apply_indexation + calculate_retirement_benefit. Validate entire end_situation including attainable_pension per policy. |
| `C08` | Multiple part-time factors + retirement | 6 | Multiple policies with different part_time_factors. Validate weighted average calculation and proportional distribution. |
| `C09` | Error: retirement without eligibility | 3 | Participant under 65, less than 40 years of service. Validate CRITICAL message, FAILURE outcome, processing halted. |
| `C10` | Error: mutation without dossier | 3 | `add_policy` or `apply_indexation` sent without prior `create_dossier`. Validate CRITICAL message, FAILURE outcome. |

**Validation rules per scenario:**

For each scenario, the client validates:

1. **HTTP status code** is `200`
2. **Response structure** matches the OpenAPI schema (required fields present, correct types)
3. **`calculation_metadata`**:
   - `calculation_outcome` matches expected (`SUCCESS` or `FAILURE`)
   - `tenant_id` echoed from request
   - `calculation_duration_ms` is a positive integer
   - `calculation_started_at` and `calculation_completed_at` are valid ISO timestamps
   - `calculation_completed_at` >= `calculation_started_at`
4. **`calculation_result.messages`**:
   - Expected messages are present with correct `level` (CRITICAL/WARNING) and correct `code`
5. **`calculation_result.end_situation`**:
   - `situation` matches the expected end state (deep comparison)
   - `mutation_id` matches the last processed mutation's ID
   - `mutation_index` is correct
6. **`calculation_result.initial_situation`**:
   - `situation.dossier` is `null`
7. **`calculation_result.mutations`**:
   - Array length matches number of mutations in request (or fewer if CRITICAL stopped processing)
   - Each entry's `mutation` object matches the corresponding request mutation

**Comparison strategy:**
- Numeric comparisons should use a tolerance of `0.01` to account for floating point differences
- Date strings compared as exact string match
- UUID strings compared as exact string match (case-insensitive)
- `calculation_id` is generated by the target, so only validate format (valid UUID), not value
- Timing fields (`calculation_started_at`, `calculation_completed_at`, `calculation_duration_ms`) are validated for format and sanity, not exact values
- Order of properties in JSON objects does not matter
- Order of items in arrays DOES matter (policies must be in the expected order)

**Scoring:**
- Binary pass/fail per scenario
- A scenario passes only if ALL validation checks pass
- Full points awarded on pass, 0 on fail

### FR-3: Performance Test Suite

Measure the target's performance across four categories. Performance tests use the same scenarios as correctness tests -- **only scenarios that passed correctness are used for performance measurement**.

**Pre-condition:** Run correctness suite first (or in the same session). Skip performance measurement for scenarios that failed correctness.

**Warmup:** Before measuring, send `--warmup-requests` (default 10) requests to warm up the target. Discard these results.

#### FR-3.1: Single Request Latency (Simple)

- Send each simple scenario (C01, C02, C03) sequentially, 100 times each
- Measure response time per request (time from sending request to receiving full response)
- Report: min, max, mean, median, p95, p99 latency
- **Score input:** mean latency across all simple scenarios

#### FR-3.2: Single Request Latency (Complex)

- Send each complex scenario (C07, C08) sequentially, 100 times each
- Same measurements as above
- **Score input:** mean latency across all complex scenarios

#### FR-3.3: Throughput

- Use a representative mix of passing scenarios
- Sustain maximum load for `--throughput-duration` seconds (default 30)
- Use `autocannon` or equivalent: start with 10 concurrent connections, pipeline 10 requests
- Report: requests/second (sustained average), total requests completed, error rate
- **Score input:** sustained requests/second

#### FR-3.4: Concurrency

- Send `--concurrency-level` (default 50) simultaneous requests
- Measure: all responses received correctly, response time under load vs. single-request baseline
- Report: mean latency under load, p99 latency under load, error count
- **Score input:** mean latency under concurrent load (lower is better)

**Performance scores are calculated relative to other teams (see FR-6).**

### FR-4: Bonus Test Suite

#### FR-4.1: Forward JSON Patch Validation

For each correctness scenario that passed:

1. Check if `forward_patch_to_situation_after_this_mutation` is present on each mutation in the response
2. If present for ALL mutations:
   - Start with `initial_situation.situation`
   - For each mutation, apply the forward patch (using RFC 6902 application)
   - Verify the result matches the expected situation after that mutation
   - The expected situation after the last mutation must match `end_situation.situation`
3. **Score:** 7 points if all patches are correct across all passing correctness scenarios, 0 otherwise

#### FR-4.2: Backward JSON Patch Validation

Pre-condition: Forward JSON Patch must be present and valid.

1. Check if `backward_patch_to_previous_situation` is present on each mutation
2. For each mutation (in reverse order):
   - Apply the backward patch to the situation after the mutation
   - Verify it produces the previous situation
3. **Score:** 4 points if all backward patches are correct, 0 otherwise

#### FR-4.3: `project_future_benefits` Mutation

Send a test scenario that includes the `project_future_benefits` mutation:

- Create dossier + add policies + apply indexation + project_future_benefits (yearly projections over 10 years)
- Validate:
  - Each policy has a `projections` array
  - Number of projection entries matches expected count based on date range and interval
  - Each projection's `projected_pension` value matches expected calculation (using the retirement benefit formula at each projection date)
  - Dossier status remains `ACTIVE` (not changed to RETIRED)
- **Score:** 5 points if all projections are correct, 0 otherwise

#### FR-4.4: External Scheme Registry Integration

The testing client starts a mock HTTP server (the "Scheme Registry") on a random port before running this test.

**Mock Scheme Registry behavior:**
- Endpoint: `GET /schemes/{scheme_id}`
- Response (constant ~50ms delay):
  ```json
  { "scheme_id": "{scheme_id}", "accrual_rate": 0.025 }
  ```
- The mock tracks no state -- every call returns the same accrual rate regardless of `scheme_id`

**Test procedure:**
1. Start the mock Scheme Registry on a random available port
2. Set `SCHEME_REGISTRY_URL=http://host:port` as an environment variable on the team's container (requires restart or a separate container run for this test)
3. Send a `calculate_retirement_benefit` scenario (same as a core correctness scenario, but expected results use `accrual_rate = 0.025` instead of `0.02`)
4. Validate that the calculation results match the expected output computed with `0.025`
5. Stop the mock server

**Score:** 5 points if the results match expected values (proving the engine fetched and used the registry's accrual rate), 0 otherwise.

#### FR-4.5: Cold Start Test

Pre-condition: `--cold-start-image` parameter must be provided.

1. Ensure no container from this image is running
2. Run `docker run -d -p <random_port>:8080 <image>`
3. Immediately start polling `POST /calculation-requests` with a simple request (C01)
4. Measure time from `docker run` command to first successful HTTP 200 response
5. Stop and remove the container
6. Repeat 3 times, take the median

**Score (tiered):**
| Cold Start Time | Points |
|---|---|
| < 500ms | 5 |
| 500ms - 1s | 3 |
| 1s - 3s | 1 |
| > 3s | 0 |

### FR-5: AI Code Review

Score Code Quality (5 points) and Clean Mutation Architecture (4 points) using an AI model.

**Procedure:**
1. Collect source files from the team's repository (parameter: `--code-path /path/to/repo`)
2. Exclude build artifacts, dependencies, and binary files (node_modules, target, bin, obj, dist, build, .git, .class, .jar, .exe)
3. Format files as `=== FILE: <relative_path> ===` followed by file contents
4. Send to the AI model using the prompt defined in `ai-code-review-prompt.md`
5. Parse the structured JSON response
6. Extract `code_quality.total` (max 5) and `clean_architecture.total` (max 4)

**Consistency:**
- Run the review **twice** per submission at temperature = 0
- If the two total scores differ by more than 1.5 points, run a **third** time and take the median
- Use the same model and prompt version for all teams

**CLI parameter:** `--code-path <path>` (optional; if not provided, AI review is skipped and scores are 0)

**Dependencies:** Requires an AI model API key (e.g., `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` environment variable).

### FR-6: Score Calculation

After all test suites complete, calculate the team's score.

#### Correctness Score (max 40)

Sum of points for all passing correctness scenarios.

#### Performance Score (max 40)

Performance scores are **relative** -- they require results from multiple teams. Two modes:

**Single-team mode** (default): Report raw performance metrics only. Do not calculate relative scores. Output a note that relative scoring requires multi-team results.

**Multi-team mode** (`--results-dir <path>`): Load all JSON result files from the specified directory. Calculate relative scores:

- **Latency (simple):** `10 * (best_mean / team_mean)` -- capped at 10
- **Latency (complex):** `10 * (best_mean / team_mean)` -- capped at 10
- **Throughput:** `10 * (team_rps / best_rps)` -- capped at 10
- **Concurrency:** `10 * (best_mean / team_mean)` -- capped at 10

Where `best_*` is the best value across all teams.

#### Bonus Score (max 30)

Sum of: Forward Patch (7) + Backward Patch (4) + Architecture (4, AI review) + Cold Start (5) + Scheme Registry (5) + project_future_benefits (5).

#### Total Score (max 115)

`correctness + performance + bonus + code_quality`

Code Quality (5 points) and Clean Mutation Architecture (4 points) are scored via AI code review. See `ai-code-review-prompt.md` for the prompt and integration details.

### FR-7: Output

#### Console Output

Display results in a human-readable table format:

```
=== Visma Performance Hackathon - Test Results ===
Team: Team Alpha
Target: http://localhost:8080

--- Correctness (40 pts) ---
  [PASS]  C01  create_dossier only                           4/4
  [PASS]  C02  create_dossier + add_policy (single)          4/4
  [FAIL]  C03  create_dossier + add_policy (multiple)        0/4
    → policy_id mismatch: expected "abc-2", got "abc-02"
  ...
  Subtotal: 36/40

--- Performance ---
  Simple latency:   mean=2.3ms  median=2.1ms  p95=4.5ms  p99=8.2ms
  Complex latency:  mean=8.7ms  median=7.9ms  p95=15.3ms p99=22.1ms
  Throughput:       4,521 req/s (30s sustained)
  Concurrency:      mean=12.3ms under 50 concurrent connections
  (Relative scoring requires multi-team results)

--- Bonus (30 pts) ---
  [PASS]  Forward JSON Patch                                 7/7
  [FAIL]  Backward JSON Patch                                0/4
    → Patch at mutation index 2 produced incorrect result
  [PASS]  Clean Mutation Architecture (AI review)             3/4
  [PASS]  Cold Start: 320ms                                  5/5
  [PASS]  Scheme Registry Integration                        5/5
  [PASS]  project_future_benefits                            5/5
  Subtotal: 25/30

--- Code Quality (AI Review, 5 pts) ---
  Readability & Organization:  1.5/2
  Error Handling:              1.0/1.5
  Project Structure:           1.5/1.5
  Subtotal: 4.0/5

--- Summary ---
  Correctness:  36/40
  Performance:  (raw metrics above, relative scoring pending)
  Bonus:        25/30
  Code Quality: 4.0/5
  TOTAL:        65/115 (excluding performance)
```

When `--verbose` is set, also print request/response bodies for failed scenarios.

#### JSON Output (`--output`)

```json
{
  "team": "Team Alpha",
  "target": "http://localhost:8080",
  "timestamp": "2026-02-11T14:30:00Z",
  "correctness": {
    "total": 36,
    "max": 40,
    "scenarios": [
      {
        "id": "C01",
        "name": "create_dossier only",
        "passed": true,
        "points": 4,
        "max_points": 4,
        "errors": []
      },
      {
        "id": "C03",
        "name": "create_dossier + add_policy (multiple)",
        "passed": false,
        "points": 0,
        "max_points": 4,
        "errors": ["policy_id mismatch: expected \"abc-2\", got \"abc-02\""]
      }
    ]
  },
  "performance": {
    "simple_latency": {
      "mean_ms": 2.3,
      "median_ms": 2.1,
      "p95_ms": 4.5,
      "p99_ms": 8.2,
      "min_ms": 1.1,
      "max_ms": 12.4,
      "sample_count": 300
    },
    "complex_latency": {
      "mean_ms": 8.7,
      "median_ms": 7.9,
      "p95_ms": 15.3,
      "p99_ms": 22.1,
      "min_ms": 5.2,
      "max_ms": 45.0,
      "sample_count": 200
    },
    "throughput": {
      "requests_per_second": 4521,
      "duration_seconds": 30,
      "total_requests": 135630,
      "error_count": 0,
      "error_rate": 0.0
    },
    "concurrency": {
      "concurrency_level": 50,
      "mean_ms": 12.3,
      "p99_ms": 35.0,
      "error_count": 0
    },
    "relative_scores": null
  },
  "bonus": {
    "total": 22,
    "max": 30,
    "forward_json_patch": { "passed": true, "points": 7 },
    "backward_json_patch": { "passed": false, "points": 0, "errors": ["..."] },
    "clean_architecture": {
      "common_interface": 1,
      "per_mutation_implementation": 1,
      "generic_dispatch": 1,
      "extensibility": 0,
      "points": 3
    },
    "cold_start": { "time_ms": 320, "points": 5 },
    "scheme_registry": { "passed": true, "points": 5 },
    "project_future_benefits": { "passed": true, "points": 5 }
  },
  "code_quality": {
    "readability_and_organization": 1.5,
    "error_handling": 1.0,
    "project_structure": 1.5,
    "points": 4.0
  },
  "total": {
    "scored": 68,
    "max_scoreable_by_tool": 115,
    "manual_pending": 0
  }
}
```

### FR-8: Multi-Team Leaderboard Scoring

When `--results-dir` is provided, the tool loads all JSON result files and calculates relative performance scores.

```bash
npx ts-node src/index.ts --results-dir ./results/ --leaderboard
```

This mode:
1. Loads all `*.json` files from the specified directory
2. For each team, calculates relative performance scores
3. Calculates total scores (correctness + relative performance + bonus)
4. Outputs a ranked leaderboard table:

```
=== Visma Performance Hackathon - Leaderboard ===

Rank  Team           Correct  Perf   Bonus  Quality  Total
───────────────────────────────────────────────────────────
  1   Team Alpha       40      38.2    17      -      95.2
  2   Team Beta        36      35.0    21      -      92.0
  3   Team Gamma       40      28.5    11      -      79.5
  4   Team Delta       32      22.1     7      -      61.1
```

5. Optionally writes the leaderboard to a JSON file for display in a web UI

## Non-Functional Requirements

### NFR-1: Performance of the Testing Client Itself

The testing client must not be the bottleneck during performance measurement.
- HTTP client must support connection pooling and keep-alive
- Latency measurements must use high-resolution timers (microsecond precision)
- The throughput test must be capable of generating at least 50,000 requests/second from the client side

### NFR-2: Reliability

- All test scenarios must be deterministic (same input always produces same expected output)
- UUIDs in test fixtures are hardcoded (not randomly generated) for reproducibility
- Timing-related validations (timestamps, duration) use generous tolerances

### NFR-3: Portability

- Must run on macOS and Linux
- Node.js 20+ as only runtime dependency
- Docker required only for cold start testing

### NFR-4: Extensibility

- Adding a new test scenario = adding a JSON fixture file + expected response
- Test scenarios are data-driven, not hardcoded in application logic
- Performance test parameters are configurable via CLI flags

## Project Structure

```
testing-client/
├── PRD.md                          # This document
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # CLI entry point
│   ├── config.ts                   # CLI argument parsing and configuration
│   ├── runner.ts                   # Test orchestration (runs suites in order)
│   ├── suites/
│   │   ├── correctness.ts          # Correctness test suite
│   │   ├── performance.ts          # Performance test suite
│   │   ├── bonus.ts                # Bonus feature test suite
│   │   └── cold-start.ts           # Cold start measurement
│   ├── validation/
│   │   ├── response-validator.ts   # Validates response structure against OpenAPI
│   │   ├── situation-comparator.ts # Deep comparison of situation objects
│   │   └── json-patch-validator.ts # Validates JSON Patch correctness
│   ├── scoring/
│   │   ├── calculator.ts           # Score calculation logic
│   │   └── leaderboard.ts          # Multi-team relative scoring
│   ├── output/
│   │   ├── console-reporter.ts     # Console output formatting
│   │   └── json-reporter.ts        # JSON output generation
│   └── types/
│       ├── api.ts                  # TypeScript types matching the OpenAPI schema
│       ├── fixtures.ts             # Test fixture types
│       └── results.ts              # Test result types
├── fixtures/
│   ├── C01-create-dossier.json
│   ├── C02-add-single-policy.json
│   ├── C03-add-multiple-policies.json
│   ├── C04-apply-indexation.json
│   ├── C05-indexation-scheme-filter.json
│   ├── C06-indexation-date-filter.json
│   ├── C07-full-happy-path.json
│   ├── C08-part-time-retirement.json
│   ├── C09-error-ineligible-retirement.json
│   ├── C10-error-no-dossier.json
│   └── B01-project-future-benefits.json
└── README.md                       # Setup and usage instructions
```

## Test Fixture Format

Each fixture file contains the full request, the expected response fields to validate, and metadata.

```json
{
  "id": "C01",
  "name": "create_dossier only",
  "description": "Single dossier creation with one participant",
  "points": 4,
  "category": "correctness",
  "request": {
    "tenant_id": "test_tenant",
    "calculation_instructions": {
      "mutations": [
        {
          "mutation_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          "mutation_definition_name": "create_dossier",
          "mutation_type": "DOSSIER_CREATION",
          "actual_at": "2020-01-01",
          "mutation_properties": {
            "dossier_id": "550e8400-e29b-41d4-a716-446655440000",
            "person_id": "660e8400-e29b-41d4-a716-446655440001",
            "name": "John Doe",
            "birth_date": "1960-06-15"
          }
        }
      ]
    }
  },
  "expected": {
    "http_status": 200,
    "calculation_outcome": "SUCCESS",
    "message_count": 0,
    "messages": [],
    "end_situation": {
      "dossier": {
        "dossier_id": "550e8400-e29b-41d4-a716-446655440000",
        "status": "ACTIVE",
        "retirement_date": null,
        "persons": [
          {
            "person_id": "660e8400-e29b-41d4-a716-446655440001",
            "role": "PARTICIPANT",
            "name": "John Doe",
            "birth_date": "1960-06-15"
          }
        ],
        "policies": []
      }
    },
    "mutations_processed_count": 1
  }
}
```

## Dependencies

| Package | Purpose |
|---|---|
| `typescript` | Language |
| `ts-node` | Run TypeScript directly |
| `commander` | CLI argument parsing |
| `undici` or `axios` | HTTP client |
| `autocannon` | HTTP load testing / throughput measurement |
| `fast-json-patch` | RFC 6902 JSON Patch application and validation |
| `ajv` | JSON Schema validation (for validating responses against OpenAPI) |
| `chalk` | Colored console output |
| `dockerode` | Docker API client (for cold start testing) |

## Open Questions / Future Considerations

1. **Leaderboard UI:** If a live leaderboard web UI is built, the JSON output from this tool is the data source. The UI would watch a directory for new/updated result files and refresh the display.
2. **Parallel multi-team testing:** Could the tool run tests against multiple team targets in parallel? Not required for v1, but the JSON output format supports aggregation.
3. **Code quality scoring:** Automated via AI code review. The AI model assesses readability, error handling, project structure, and clean architecture. See `ai-code-review-prompt.md` for the prompt and consistency measures.
