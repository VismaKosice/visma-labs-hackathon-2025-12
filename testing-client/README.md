# Hackathon Testing Client

Command-line testing client for the Visma Performance Hackathon. Validates correctness, measures performance, tests bonus features, and calculates scores for team submissions.

## Prerequisites

- **Node.js 20+**
- **Docker** (only needed for cold start testing)

## Setup

```bash
cd testing-client
npm install
```

## Usage

### Run all tests against a target

```bash
npx ts-node src/index.ts --target http://localhost:8080
```

### Run specific test suites

```bash
# Correctness only
npx ts-node src/index.ts --target http://localhost:8080 --suite correctness

# Performance only
npx ts-node src/index.ts --target http://localhost:8080 --suite performance

# Bonus only
npx ts-node src/index.ts --target http://localhost:8080 --suite bonus
```

### Run with team name and output

```bash
npx ts-node src/index.ts --target http://localhost:8080 --team "Team Alpha" --output results.json
```

### Cold start test (requires Docker image)

```bash
npx ts-node src/index.ts --target http://localhost:8080 --cold-start-image my-team:latest
```

### AI code review

```bash
# Requires OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable
npx ts-node src/index.ts --target http://localhost:8080 --code-path /path/to/team/repo
```

### Multi-team leaderboard

```bash
npx ts-node src/index.ts --target http://localhost:8080 --results-dir ./results/ --leaderboard
```

## Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `--target <url>` | Yes | - | Base URL of the team's API |
| `--suite <name>` | No | `all` | Test suite: `all`, `correctness`, `performance`, `bonus` |
| `--output <path>` | No | - | Path to write JSON results file |
| `--team <name>` | No | `unnamed` | Team name |
| `--cold-start-image <image>` | No | - | Docker image for cold start testing |
| `--code-path <path>` | No | - | Path to team source code for AI review |
| `--verbose` | No | `false` | Show detailed output for failed tests |
| `--warmup-requests <count>` | No | `10` | Warmup requests before performance measurement |
| `--throughput-duration <secs>` | No | `30` | Duration for throughput test |
| `--concurrency-level <count>` | No | `50` | Concurrent connections for concurrency test |
| `--results-dir <path>` | No | - | Directory with JSON results for leaderboard |
| `--leaderboard` | No | `false` | Calculate and display leaderboard |

## Test Scenarios

### Correctness (40 points)

| ID | Scenario | Points |
|---|---|---|
| C01 | create_dossier only | 4 |
| C02 | create_dossier + add_policy (single) | 4 |
| C03 | create_dossier + add_policy (multiple) | 4 |
| C04 | apply_indexation (no filters) | 4 |
| C05 | apply_indexation with scheme_id filter | 3 |
| C06 | apply_indexation with effective_before filter | 3 |
| C07 | Full happy path (create + policies + indexation + retirement) | 6 |
| C08 | Multiple part-time factors + retirement | 6 |
| C09 | Error: retirement without eligibility | 3 |
| C10 | Error: mutation without dossier | 3 |

### Bonus (30 points)

| Feature | Points |
|---|---|
| Forward JSON Patch | 7 |
| Backward JSON Patch | 4 |
| Clean Mutation Architecture (AI review) | 4 |
| Cold Start Performance | 5 |
| External Scheme Registry Integration | 5 |
| project_future_benefits mutation | 5 |

### Code Quality (5 points, AI review)

| Aspect | Points |
|---|---|
| Readability & Organization | 2 |
| Error Handling | 1.5 |
| Project Structure | 1.5 |

## Fixtures

Test fixtures are stored in `fixtures/` as JSON files. Each fixture contains:
- `id`: Unique identifier (C01, C02, etc.)
- `name`: Human-readable name
- `request`: The full calculation request to send
- `expected`: Expected response values to validate against

To regenerate fixtures (e.g., after changing expected values):

```bash
npx ts-node scripts/generate-fixtures.ts
```

## Project Structure

```
testing-client/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── config.ts             # CLI argument parsing
│   ├── runner.ts             # Test orchestration
│   ├── suites/
│   │   ├── correctness.ts    # Correctness test suite
│   │   ├── performance.ts    # Performance test suite
│   │   ├── bonus.ts          # Bonus feature tests
│   │   ├── cold-start.ts     # Cold start measurement
│   │   └── ai-review.ts      # AI code review
│   ├── validation/
│   │   ├── response-validator.ts    # Response structure validation
│   │   ├── situation-comparator.ts  # Deep comparison with tolerance
│   │   └── json-patch-validator.ts  # JSON Patch validation
│   ├── scoring/
│   │   ├── calculator.ts     # Score calculation
│   │   └── leaderboard.ts    # Multi-team scoring
│   ├── output/
│   │   ├── console-reporter.ts  # Console output
│   │   └── json-reporter.ts     # JSON file output
│   ├── helpers/
│   │   ├── http-client.ts    # HTTP client wrapper
│   │   ├── fixture-loader.ts # Fixture file loading (cached)
│   │   ├── pension-math.ts   # Reference pension calculations
│   │   └── environment.ts    # System environment snapshot
│   └── types/
│       ├── api.ts            # API types (OpenAPI schema)
│       ├── fixtures.ts       # Fixture types
│       └── results.ts        # Result types
├── fixtures/                  # Test fixture JSON files
├── scripts/
│   └── generate-fixtures.ts  # Fixture generation script
├── package.json
└── tsconfig.json
```
