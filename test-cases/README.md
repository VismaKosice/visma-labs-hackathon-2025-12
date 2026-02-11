# Test Cases

Self-validation test cases for the Pension Calculation Engine. Use these to verify your implementation produces correct results before submitting.

## Quick Start

```bash
# 1. Start your engine (must be running on port 8080)
docker build -t my-engine .
docker run -p 8080:8080 my-engine

# 2. In another terminal, run all tests
```

**macOS / Linux** (requires `curl` and `jq`):

```bash
./test-cases/run-tests.sh

# Run against a different port
./test-cases/run-tests.sh http://localhost:3000

# Run a single test case
./test-cases/run-tests.sh http://localhost:8080 C07
```

**Windows** (PowerShell — no extra dependencies):

```powershell
.\test-cases\run-tests.ps1

# Run against a different port
.\test-cases\run-tests.ps1 -BaseUrl http://localhost:3000

# Run a single test case
.\test-cases\run-tests.ps1 -Filter C07
```

## Test Case Format

Each `.json` file contains:

- **`request`**: The exact JSON payload to send to `POST /calculation-requests`
- **`expected`**: What your response should contain:
  - `http_status`: Expected HTTP status code (always 200 for valid calculations)
  - `calculation_outcome`: `"SUCCESS"` or `"FAILURE"`
  - `messages`: Expected validation messages (level + code)
  - `end_situation`: The expected final calculation state (deep compared with 0.01 numeric tolerance)
  - `end_situation_mutation_id`: Which mutation ID the end_situation should reference
  - `end_situation_mutation_index`: The 0-based index of the last relevant mutation
  - `end_situation_actual_at`: The actual_at date of the end_situation
  - `mutations_processed_count`: How many mutations appear in the response's `mutations` array

## Core Correctness Tests (C01-C10)

These are the **scored** test scenarios. They cover all required mutations and error handling:

| Test | Name | What it validates |
|------|------|-------------------|
| C01 | create_dossier only | Dossier creation, person fields, status=ACTIVE, empty policies |
| C02 | add_policy (single) | Policy ID format `{dossier_id}-1`, all policy fields |
| C03 | add_policy (multiple) | Sequential policy_id generation (-1, -2, -3) |
| C04 | apply_indexation (no filters) | All salaries updated: `50000 * 1.03 = 51500` |
| C05 | apply_indexation + scheme_id filter | Only matching scheme updated, others unchanged |
| C06 | apply_indexation + effective_before filter | Only policies before date updated |
| C07 | Full happy path | All mutations + retirement calculation with `attainable_pension` |
| C08 | Part-time + retirement | Weighted average salary and proportional pension distribution |
| C09 | Error: ineligible retirement | CRITICAL NOT_ELIGIBLE, FAILURE outcome, end_situation before failure |
| C10 | Error: no dossier | CRITICAL DOSSIER_NOT_FOUND, end_situation has null dossier |

## Warning/Edge Case Tests (C11-C14)

These test warning scenarios. They are not directly scored but help validate your edge case handling:

| Test | Name | What it validates |
|------|------|-------------------|
| C11 | Duplicate policy | WARNING DUPLICATE_POLICY, both policies kept, processing continues |
| C12 | No matching policies | WARNING NO_MATCHING_POLICIES, salaries unchanged |
| C13 | Negative salary clamped | WARNING NEGATIVE_SALARY_CLAMPED, salary clamped to 0 |
| C14 | Retirement before employment | WARNING RETIREMENT_BEFORE_EMPLOYMENT, policy gets 0 pension |

## Bonus Test (B01)

| Test | Name | What it validates |
|------|------|-------------------|
| B01 | project_future_benefits | Yearly projections over 10 years, projections array, status stays ACTIVE |

## What the Test Runner Checks

The `run-tests.sh` script validates:

1. **HTTP status** matches expected
2. **calculation_outcome** matches (SUCCESS/FAILURE)
3. **messages** array matches (level + code for each message)
4. **end_situation** deep comparison with **0.01 numeric tolerance**
5. **end_situation metadata** (mutation_id, mutation_index, actual_at)
6. **mutations_processed_count** (number of mutations in response)

## Manual Testing

You can also test manually with `curl`:

```bash
# Extract just the request from a test case and send it
jq '.request' test-cases/C01-create-dossier.json | \
  curl -s -X POST http://localhost:8080/calculation-requests \
    -H "Content-Type: application/json" \
    -d @- | jq .
```

## Notes

- Numeric values are compared with a tolerance of **0.01** (same as the official test suite)
- UUID comparisons are case-insensitive
- The test runner does **not** check response timing fields (`calculation_started_at`, etc.) — those are engine-generated
- The test runner does **not** check `calculation_id` — that's a UUID v4 your engine generates
- These test cases use the **default accrual rate of 0.02** (no Scheme Registry integration)
