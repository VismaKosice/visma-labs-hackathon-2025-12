#!/usr/bin/env bash
#
# run-all-teams.sh -- Run the full test suite against all teams sequentially.
#
# This is the main orchestrator script for hackathon day.
# For each team it reads the repo URL from teams.json, clones the source code,
# builds a Docker image locally, runs all tests, and saves results.
#
# FAIRNESS MEASURES:
#   - Team order is randomized by default (disable with --no-shuffle)
#   - Docker images are built with --no-cache (no layer-caching bias)
#   - Docker images are removed after each team
#   - A cooldown period is inserted between teams
#   - Team containers are CPU/memory-limited
#   - System load is checked before each team's test
#   - Consistent performance parameters across all teams
#
set -euo pipefail

# -------------------------------------------------------------------
# Defaults
# -------------------------------------------------------------------
TEAMS_FILE=""
OUTPUT_DIR="$HOME/results"
REPOS_DIR="$HOME/repos"
TESTING_CLIENT_DIR=""
CONTAINER_PORT=8080
SKIP_AI_REVIEW=false
SKIP_COLD_START=false
NO_SHUFFLE=false
COOLDOWN_SECONDS=10
WARMUP_REQUESTS=20
THROUGHPUT_DURATION=15
CONCURRENCY_LEVEL=50
# Docker resource limits for team containers (ensures fair allocation)
DOCKER_CPUS="3.0"          # Leave 1 core for test runner + OS
DOCKER_MEMORY="12g"        # Leave ~4 GB for test runner + OS on 16 GB VM
MAX_LOAD_RATIO="0.5"       # Warn/pause if 1-min load avg / CPU count > this
BUILD_TIMEOUT=600          # Docker build timeout in seconds (10 minutes)
TEST_TIMEOUT=600           # Testing client timeout in seconds (10 minutes)
MAX_SCORE=115              # Total possible score (correctness 40 + performance 40 + bonus 30 + code quality 5)

# -------------------------------------------------------------------
# Usage
# -------------------------------------------------------------------
usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Run the hackathon test suite against all teams sequentially.
Reads team names and repo URLs from a teams.json config file.
For each team: clones the repo, builds a Docker image, and runs tests.

Optional:
  --teams-file <path>     Path to teams.json (default: auto-detect from script dir)
  --output-dir <path>     Directory to write result JSON files (default: ~/results)
  --repos-dir <path>      Directory for cloned team repos (default: ~/repos)
  --testing-client <path> Path to the testing client directory (default: auto-detect)
  --skip-ai-review        Skip AI code review
  --skip-cold-start       Skip cold start testing
  --no-shuffle            Don't randomize team order (test in the order given)
  --cooldown <secs>       Seconds to wait between teams (default: $COOLDOWN_SECONDS)
  --warmup-requests <n>   Warmup requests for performance tests (default: $WARMUP_REQUESTS)
  --throughput-duration <s>  Throughput test duration in seconds (default: $THROUGHPUT_DURATION)
  --concurrency-level <n> Concurrent requests for concurrency test (default: $CONCURRENCY_LEVEL)
  --docker-cpus <n>       CPU limit for team containers (default: $DOCKER_CPUS)
  --docker-memory <size>  Memory limit for team containers (default: $DOCKER_MEMORY)
  -h, --help              Show this help message

teams.json Format:
  [
    { "name": "alpha", "repo_url": "https://github.com/org/hackathon-team-alpha.git" },
    { "name": "beta",  "repo_url": "https://github.com/org/hackathon-team-beta.git" }
  ]

Fairness Measures:
  This script implements several measures to ensure fair comparison between teams:

  1. RANDOMIZED ORDER: Team execution order is shuffled by default so that no
     team systematically benefits from running first (cold VM) or last (warm caches).
     Use --no-shuffle to disable if you want deterministic ordering.

  2. NO-CACHE BUILDS: Docker images are built with --no-cache so that no team
     benefits from cached layers left by a previous team's build.

  3. IMAGE CLEANUP: After each team, the Docker image is removed and unused
     layers are pruned to prevent cache accumulation.

  4. COOLDOWN PERIOD: A ${COOLDOWN_SECONDS}s pause between teams allows the system to settle
     (GC, writeback, kernel caches) before the next team's tests begin.

  5. RESOURCE LIMITS: Team containers are CPU- and memory-limited so they can't
     starve the testing client (or the OS) of resources.

  6. SYSTEM LOAD CHECK: Before each team's tests, the script checks the 1-minute
     load average. If it exceeds the threshold, it waits until the system settles.

  7. CONSISTENT PARAMETERS: The same warmup, throughput, and concurrency settings
     are passed to every team's test run.

  8. ENVIRONMENT SNAPSHOT: The testing client records CPU model, core count,
     memory, and load average in each team's JSON results for post-hoc comparison.

Example:
  $(basename "$0") --teams-file infrastructure/teams.json --output-dir ~/results

EOF
    exit 0
}

# -------------------------------------------------------------------
# Parse arguments
# -------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --teams-file)   TEAMS_FILE="$2"; shift 2 ;;
        --output-dir)   OUTPUT_DIR="$2"; shift 2 ;;
        --repos-dir)    REPOS_DIR="$2"; shift 2 ;;
        --testing-client) TESTING_CLIENT_DIR="$2"; shift 2 ;;
        --skip-ai-review) SKIP_AI_REVIEW=true; shift ;;
        --skip-cold-start) SKIP_COLD_START=true; shift ;;
        --no-shuffle)   NO_SHUFFLE=true; shift ;;
        --cooldown)     COOLDOWN_SECONDS="$2"; shift 2 ;;
        --warmup-requests) WARMUP_REQUESTS="$2"; shift 2 ;;
        --throughput-duration) THROUGHPUT_DURATION="$2"; shift 2 ;;
        --concurrency-level) CONCURRENCY_LEVEL="$2"; shift 2 ;;
        --docker-cpus)  DOCKER_CPUS="$2"; shift 2 ;;
        --docker-memory) DOCKER_MEMORY="$2"; shift 2 ;;
        -h|--help)      usage ;;
        *)              echo "Unknown option: $1"; usage ;;
    esac
done

# -------------------------------------------------------------------
# Auto-detect paths
# -------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ -z "$TEAMS_FILE" ]]; then
    TEAMS_FILE="$SCRIPT_DIR/teams.json"
fi

if [[ -z "$TESTING_CLIENT_DIR" ]]; then
    TESTING_CLIENT_DIR="$SCRIPT_DIR/../testing-client"
fi

# -------------------------------------------------------------------
# Validate
# -------------------------------------------------------------------
if [[ ! -f "$TEAMS_FILE" ]]; then
    echo "ERROR: Teams file not found: $TEAMS_FILE"
    echo "Create it with create-team-repos.sh or manually."
    echo "Expected format: [ { \"name\": \"alpha\", \"repo_url\": \"https://...\" }, ... ]"
    exit 1
fi

if [[ ! -d "$TESTING_CLIENT_DIR" ]]; then
    echo "ERROR: Testing client directory not found: $TESTING_CLIENT_DIR"
    echo "Use --testing-client to specify the correct path."
    exit 1
fi

# Verify jq is available (needed to parse teams.json)
if ! command -v jq &>/dev/null; then
    echo "ERROR: jq is not installed. Install it: sudo apt-get install -y jq"
    exit 1
fi

# -------------------------------------------------------------------
# Read teams from JSON
# -------------------------------------------------------------------
TEAM_COUNT=$(jq 'length' "$TEAMS_FILE")
if [[ "$TEAM_COUNT" -eq 0 ]]; then
    echo "ERROR: No teams found in $TEAMS_FILE"
    exit 1
fi

# Build parallel arrays of names and URLs
TEAM_NAMES=()
TEAM_URLS=()
for i in $(seq 0 $((TEAM_COUNT - 1))); do
    NAME=$(jq -r ".[$i].name" "$TEAMS_FILE")
    URL=$(jq -r ".[$i].repo_url" "$TEAMS_FILE")
    if [[ -z "$NAME" || "$NAME" == "null" || -z "$URL" || "$URL" == "null" ]]; then
        echo "ERROR: Invalid entry at index $i in $TEAMS_FILE (name or repo_url missing)"
        exit 1
    fi
    TEAM_NAMES+=("$NAME")
    TEAM_URLS+=("$URL")
done

# -------------------------------------------------------------------
# Prepare execution order (optionally shuffled)
# -------------------------------------------------------------------
INDICES=()
for i in $(seq 0 $((TEAM_COUNT - 1))); do
    INDICES+=("$i")
done

if [[ "$NO_SHUFFLE" == false ]]; then
    SHUFFLED=()
    while IFS= read -r line; do
        SHUFFLED+=("$line")
    done < <(printf '%s\n' "${INDICES[@]}" | shuf)
    INDICES=("${SHUFFLED[@]}")
fi

# Build ordered team name list for display
ORDERED_NAMES=()
for idx in "${INDICES[@]}"; do
    ORDERED_NAMES+=("${TEAM_NAMES[$idx]}")
done

TOTAL_TEAMS=${#INDICES[@]}

# -------------------------------------------------------------------
# Prepare
# -------------------------------------------------------------------
mkdir -p "$OUTPUT_DIR"
mkdir -p "$REPOS_DIR"

echo "============================================"
echo "  Visma Performance Hackathon - Test Runner"
echo "============================================"
echo ""
echo "Teams file:     $TEAMS_FILE"
echo "Teams:          ${ORDERED_NAMES[*]}"
echo "Total teams:    $TOTAL_TEAMS"
echo "Shuffled:       $(if [[ "$NO_SHUFFLE" == false ]]; then echo "YES"; else echo "NO"; fi)"
echo "Output:         $OUTPUT_DIR"
echo "Repos:          $REPOS_DIR"
echo "Testing client: $TESTING_CLIENT_DIR"
echo "AI review:      $(if $SKIP_AI_REVIEW; then echo "SKIPPED"; else echo "ENABLED"; fi)"
echo "Cold start:     $(if $SKIP_COLD_START; then echo "SKIPPED"; else echo "ENABLED"; fi)"
echo "Cooldown:       ${COOLDOWN_SECONDS}s between teams"
echo "Docker limits:  ${DOCKER_CPUS} CPUs, ${DOCKER_MEMORY} memory"
echo "Perf params:    warmup=${WARMUP_REQUESTS}, throughput=${THROUGHPUT_DURATION}s, concurrency=${CONCURRENCY_LEVEL}"
echo ""

# Record the execution order for auditability
echo "Execution order: ${ORDERED_NAMES[*]}" > "$OUTPUT_DIR/_execution_order.txt"
echo "Started: $(date -Iseconds)" >> "$OUTPUT_DIR/_execution_order.txt"

# -------------------------------------------------------------------
# Helper functions
# -------------------------------------------------------------------
cleanup_containers() {
    echo "  Cleaning up containers..."
    docker stop hackathon-team 2>/dev/null || true
    docker rm hackathon-team 2>/dev/null || true
}

wait_for_container() {
    local url="$1"
    local max_wait="${2:-30}"
    local waited=0

    while [[ $waited -lt $max_wait ]]; do
        sleep 2
        waited=$((waited + 2))
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X POST "$url" \
            -H "Content-Type: application/json" \
            -d '{"tenant_id":"warmup","calculation_instructions":{"mutations":[{"mutation_id":"00000000-0000-0000-0000-000000000001","mutation_definition_name":"create_dossier","mutation_type":"DOSSIER_CREATION","actual_at":"2025-01-01","mutation_properties":{"dossier_id":"00000000-0000-0000-0000-000000000099","person_id":"00000000-0000-0000-0000-000000000098","name":"Warmup","birth_date":"1960-01-01"}}]}}' \
            2>/dev/null || echo "000")
        if [[ "$HTTP_CODE" == "200" ]]; then
            echo "  Container ready after ${waited}s"
            return 0
        fi
    done

    echo "  WARNING: Container did not respond within ${max_wait}s"
    return 1
}

# Wait until system load drops below threshold
wait_for_low_load() {
    local cpu_count
    cpu_count=$(nproc 2>/dev/null || echo 4)
    local threshold
    threshold=$(awk "BEGIN { printf \"%.1f\", $cpu_count * $MAX_LOAD_RATIO }")

    local attempts=0
    local max_attempts=30  # Max 5 minutes (30 x 10s)

    while [[ $attempts -lt $max_attempts ]]; do
        local load_1m
        load_1m=$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo "0.0")

        if awk "BEGIN { exit ($load_1m <= $threshold) ? 1 : 0 }"; then
            echo "  System load is high ($load_1m > $threshold). Waiting 10s..."
            sleep 10
            attempts=$((attempts + 1))
        else
            if [[ $attempts -gt 0 ]]; then
                echo "  System load settled ($load_1m <= $threshold). Proceeding."
            fi
            return 0
        fi
    done

    echo "  WARNING: System load still elevated after $(( attempts * 10 ))s. Proceeding anyway."
}

# Print current system stats
print_system_stats() {
    echo "  System: $(nproc 2>/dev/null || echo '?') CPUs, $(free -m 2>/dev/null | awk '/Mem:/ {printf "%d/%d MB free", $4, $2}' || echo '? memory')"
    echo "  Load:   $(cat /proc/loadavg 2>/dev/null | awk '{print $1, $2, $3}' || echo '?')"
}

# -------------------------------------------------------------------
# Pre-flight checks
# -------------------------------------------------------------------
echo "--- Pre-flight checks ---"
echo ""
print_system_stats
echo ""

# Verify Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running or not accessible."
    exit 1
fi
echo "Docker: $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo 'OK')"

# Verify git is available
if ! command -v git &>/dev/null; then
    echo "ERROR: git is not installed."
    exit 1
fi
echo "Git:    $(git --version 2>/dev/null)"

# Verify all team repos are accessible
echo ""
echo "Verifying repository access for all teams..."
ALL_ACCESSIBLE=true
for idx in "${INDICES[@]}"; do
    TEAM="${TEAM_NAMES[$idx]}"
    REPO_URL="${TEAM_URLS[$idx]}"
    if ! git ls-remote --heads "$REPO_URL" > /dev/null 2>&1; then
        echo "  ERROR: Cannot access repo for team $TEAM: $REPO_URL"
        ALL_ACCESSIBLE=false
    else
        echo "  OK: $TEAM ($REPO_URL)"
    fi
done

if [[ "$ALL_ACCESSIBLE" == false ]]; then
    echo ""
    echo "ERROR: Some team repositories are not accessible."
    echo "Check the URLs in $TEAMS_FILE and your authentication."
    exit 1
fi
echo ""

# -------------------------------------------------------------------
# Run tests for each team
# -------------------------------------------------------------------
TEAM_INDEX=0
for idx in "${INDICES[@]}"; do
    TEAM_INDEX=$((TEAM_INDEX + 1))
    TEAM="${TEAM_NAMES[$idx]}"
    REPO_URL="${TEAM_URLS[$idx]}"
    IMAGE_NAME="hackathon-team-$TEAM:latest"
    TEAM_REPO_DIR="$REPOS_DIR/$TEAM"

    echo ""
    echo "============================================"
    echo "  Team: $TEAM ($TEAM_INDEX/$TOTAL_TEAMS)"
    echo "  Repo: $REPO_URL"
    echo "============================================"
    echo ""

    # ----------------------------------------------------------
    # Wait for system to settle (fairness: avoid residual load)
    # ----------------------------------------------------------
    if [[ $TEAM_INDEX -gt 1 ]]; then
        echo "[0] Cooldown (${COOLDOWN_SECONDS}s) + load check..."
        sleep "$COOLDOWN_SECONDS"
    fi
    wait_for_low_load
    print_system_stats

    # ----------------------------------------------------------
    # Clean up any leftover containers
    # ----------------------------------------------------------
    cleanup_containers

    # ----------------------------------------------------------
    # Clone team repository
    # ----------------------------------------------------------
    echo "[1] Cloning team repo..."
    rm -rf "$TEAM_REPO_DIR"
    if ! git clone --depth 1 "$REPO_URL" "$TEAM_REPO_DIR" 2>&1; then
        echo "  ERROR: Failed to clone repo $REPO_URL. Skipping team $TEAM."
        echo '{"team":"'"$TEAM"'","error":"Failed to clone repository","total":{"scored":0,"max_scoreable_by_tool":'"$MAX_SCORE"',"manual_pending":0}}' \
            > "$OUTPUT_DIR/team-$TEAM.json"
        continue
    fi
    echo "  Cloned to $TEAM_REPO_DIR"

    # ----------------------------------------------------------
    # Validate Dockerfile exists
    # ----------------------------------------------------------
    if [[ ! -f "$TEAM_REPO_DIR/Dockerfile" ]]; then
        echo "  ERROR: No Dockerfile found in repository root. Skipping team $TEAM."
        echo '{"team":"'"$TEAM"'","error":"No Dockerfile found","total":{"scored":0,"max_scoreable_by_tool":'"$MAX_SCORE"',"manual_pending":0}}' \
            > "$OUTPUT_DIR/team-$TEAM.json"
        continue
    fi

    # ----------------------------------------------------------
    # Build Docker image locally (--no-cache for fairness)
    # ----------------------------------------------------------
    echo "[2] Building Docker image: $IMAGE_NAME (--no-cache, timeout=${BUILD_TIMEOUT}s)..."
    BUILD_START=$(date +%s)
    if ! timeout "$BUILD_TIMEOUT" docker build --no-cache -t "$IMAGE_NAME" "$TEAM_REPO_DIR" 2>&1; then
        BUILD_END=$(date +%s)
        BUILD_TIME=$((BUILD_END - BUILD_START))
        echo "  ERROR: Docker build failed or timed out after ${BUILD_TIME}s. Skipping team $TEAM."
        echo '{"team":"'"$TEAM"'","error":"Docker build failed","build_time_seconds":'"$BUILD_TIME"',"total":{"scored":0,"max_scoreable_by_tool":'"$MAX_SCORE"',"manual_pending":0}}' \
            > "$OUTPUT_DIR/team-$TEAM.json"
        continue
    fi
    BUILD_END=$(date +%s)
    BUILD_TIME=$((BUILD_END - BUILD_START))
    echo "  Image built successfully in ${BUILD_TIME}s"

    # ----------------------------------------------------------
    # Start the team's container (with resource limits)
    # ----------------------------------------------------------
    echo "[3] Starting container (--cpus=$DOCKER_CPUS --memory=$DOCKER_MEMORY)..."
    docker run -d \
        --name hackathon-team \
        --cpus="$DOCKER_CPUS" \
        --memory="$DOCKER_MEMORY" \
        -p "$CONTAINER_PORT:8080" \
        "$IMAGE_NAME"

    echo "  Waiting for container to be ready..."
    if ! wait_for_container "http://localhost:$CONTAINER_PORT/calculation-requests"; then
        echo "  ERROR: Container failed to start. Checking logs..."
        docker logs hackathon-team 2>&1 | tail -20
        echo ""
        echo "  Skipping team $TEAM."
        echo '{"team":"'"$TEAM"'","error":"Container failed to start","build_time_seconds":'"$BUILD_TIME"',"total":{"scored":0,"max_scoreable_by_tool":'"$MAX_SCORE"',"manual_pending":0}}' \
            > "$OUTPUT_DIR/team-$TEAM.json"
        cleanup_containers
        continue
    fi

    # ----------------------------------------------------------
    # Build testing client command
    # ----------------------------------------------------------
    echo "[4] Running test suite..."
    TEST_CMD=(
        npx ts-node src/index.ts
        --target "http://localhost:$CONTAINER_PORT"
        --team "$TEAM"
        --output "$OUTPUT_DIR/team-$TEAM.json"
        --warmup-requests "$WARMUP_REQUESTS"
        --throughput-duration "$THROUGHPUT_DURATION"
        --concurrency-level "$CONCURRENCY_LEVEL"
    )

    # Always pass image name (needed for both cold start and scheme registry bonus)
    TEST_CMD+=(--cold-start-image "$IMAGE_NAME")

    if [[ "$SKIP_COLD_START" == true ]]; then
        TEST_CMD+=(--skip-cold-start)
    fi

    # Reuse the cloned repo for AI code review
    if [[ "$SKIP_AI_REVIEW" == false ]]; then
        TEST_CMD+=(--code-path "$TEAM_REPO_DIR")
    fi

    # Run tests from the testing client directory (with timeout)
    (cd "$TESTING_CLIENT_DIR" && timeout "$TEST_TIMEOUT" "${TEST_CMD[@]}") || {
        echo "  WARNING: Testing client exited with non-zero status for team $TEAM"
    }

    # ----------------------------------------------------------
    # Clean up
    # ----------------------------------------------------------
    echo "[5] Cleaning up..."
    cleanup_containers

    # Remove the team's Docker image and prune to prevent cache accumulation
    echo "  Removing Docker image $IMAGE_NAME..."
    docker rmi "$IMAGE_NAME" > /dev/null 2>&1 || true
    docker image prune -f > /dev/null 2>&1 || true
    docker builder prune -f > /dev/null 2>&1 || true

    echo ""
    echo "  Results saved to: $OUTPUT_DIR/team-$TEAM.json"
    echo "  Build time: ${BUILD_TIME}s (not scored)"
    echo "  Team $TEAM finished: $(date -Iseconds)" >> "$OUTPUT_DIR/_execution_order.txt"
done

# -------------------------------------------------------------------
# Generate leaderboard
# -------------------------------------------------------------------
echo ""
echo "============================================"
echo "  All teams tested!"
echo "============================================"
echo ""
echo "Execution order was: ${ORDERED_NAMES[*]}"
echo ""
echo "Results directory: $OUTPUT_DIR"
echo ""
ls -la "$OUTPUT_DIR"/team-*.json 2>/dev/null || echo "  (no result files found)"
echo ""

# Auto-generate leaderboard
echo "--- Generating Leaderboard ---"
echo ""
(cd "$TESTING_CLIENT_DIR" && npx ts-node src/index.ts --results-dir "$OUTPUT_DIR" --leaderboard) || {
    echo "WARNING: Leaderboard generation failed."
    echo ""
    echo "To generate manually:"
    echo "  cd $TESTING_CLIENT_DIR"
    echo "  npx ts-node src/index.ts --results-dir $OUTPUT_DIR --leaderboard"
}
echo ""

echo "Completed: $(date -Iseconds)" >> "$OUTPUT_DIR/_execution_order.txt"
