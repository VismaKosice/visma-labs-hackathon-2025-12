#!/usr/bin/env bash
#
# continuous-test.sh -- Continuously poll team repos and test on new commits.
#
# This script enables a live leaderboard experience:
#   1. Polls all team repos for new commits on their main branch
#   2. When a new commit is detected, clones/builds/tests that team
#   3. Regenerates leaderboard.json after each team is tested
#   4. The leaderboard UI (served separately) auto-refreshes from leaderboard.json
#
# Teams can push code at any time and see their results update on the leaderboard.
#
set -uo pipefail

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
POLL_INTERVAL=120          # Seconds between polling cycles
COOLDOWN_SECONDS=5         # Cooldown between team tests within a cycle
WARMUP_REQUESTS=20
THROUGHPUT_DURATION=15
CONCURRENCY_LEVEL=50
DOCKER_CPUS="3.0"
DOCKER_MEMORY="12g"
MAX_LOAD_RATIO="0.5"
BUILD_TIMEOUT=600
TEST_TIMEOUT=600
COMMIT_TRACKING_FILE=""    # Auto-set based on OUTPUT_DIR
RUN_ONCE=false             # If true, run one full cycle and exit
CONTAINER_ENGINE=""        # Auto-detect: docker or podman

# -------------------------------------------------------------------
# Usage
# -------------------------------------------------------------------
usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Continuously poll team repositories for new commits and run tests.
Results are written to JSON files and a leaderboard.json is regenerated
after each team test, enabling a live leaderboard UI.

Options:
  --teams-file <path>       Path to teams.json (default: auto-detect)
  --output-dir <path>       Directory for result JSON files (default: ~/results)
  --repos-dir <path>        Directory for cloned repos (default: ~/repos)
  --testing-client <path>   Path to testing client directory (default: auto-detect)
  --poll-interval <secs>    Seconds between polling cycles (default: $POLL_INTERVAL)
  --cooldown <secs>         Seconds between team tests (default: $COOLDOWN_SECONDS)
  --skip-ai-review          Skip AI code review
  --skip-cold-start         Skip cold start testing
  --run-once                Run one full cycle and exit (useful for cron)
  --warmup-requests <n>     Warmup requests (default: $WARMUP_REQUESTS)
  --throughput-duration <s>  Throughput duration (default: $THROUGHPUT_DURATION)
  --concurrency-level <n>   Concurrency level (default: $CONCURRENCY_LEVEL)
  --docker-cpus <n>         CPU limit for containers (default: $DOCKER_CPUS)
  --docker-memory <size>    Memory limit for containers (default: $DOCKER_MEMORY)
  -h, --help                Show this help

How it works:
  1. On startup, checks all teams for the latest commit on their main branch
  2. Compares against the last-tested commit (tracked in _commit_tracking.json)
  3. If a new commit is found, the team is tested and results updated
  4. After each team test, leaderboard.json is regenerated
  5. Waits --poll-interval seconds, then repeats

The leaderboard HTML page (served separately) fetches leaderboard.json
and auto-refreshes to show live results.

EOF
    exit 0
}

# -------------------------------------------------------------------
# Parse arguments
# -------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --teams-file)       TEAMS_FILE="$2"; shift 2 ;;
        --output-dir)       OUTPUT_DIR="$2"; shift 2 ;;
        --repos-dir)        REPOS_DIR="$2"; shift 2 ;;
        --testing-client)   TESTING_CLIENT_DIR="$2"; shift 2 ;;
        --poll-interval)    POLL_INTERVAL="$2"; shift 2 ;;
        --cooldown)         COOLDOWN_SECONDS="$2"; shift 2 ;;
        --skip-ai-review)   SKIP_AI_REVIEW=true; shift ;;
        --skip-cold-start)  SKIP_COLD_START=true; shift ;;
        --run-once)         RUN_ONCE=true; shift ;;
        --warmup-requests)  WARMUP_REQUESTS="$2"; shift 2 ;;
        --throughput-duration) THROUGHPUT_DURATION="$2"; shift 2 ;;
        --concurrency-level) CONCURRENCY_LEVEL="$2"; shift 2 ;;
        --docker-cpus)      DOCKER_CPUS="$2"; shift 2 ;;
        --docker-memory)    DOCKER_MEMORY="$2"; shift 2 ;;
        -h|--help)          usage ;;
        *)                  echo "Unknown option: $1"; usage ;;
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

COMMIT_TRACKING_FILE="$OUTPUT_DIR/_commit_tracking.json"

# -------------------------------------------------------------------
# Validate
# -------------------------------------------------------------------
if [[ ! -f "$TEAMS_FILE" ]]; then
    echo "ERROR: Teams file not found: $TEAMS_FILE"
    exit 1
fi

if [[ ! -d "$TESTING_CLIENT_DIR" ]]; then
    echo "ERROR: Testing client directory not found: $TESTING_CLIENT_DIR"
    exit 1
fi

for cmd in jq git; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "ERROR: $cmd is not installed."
        exit 1
    fi
done

# Auto-detect container engine (docker or podman)
if [[ -z "$CONTAINER_ENGINE" ]]; then
    if command -v docker &>/dev/null; then
        CONTAINER_ENGINE="docker"
    elif command -v podman &>/dev/null; then
        CONTAINER_ENGINE="podman"
    else
        echo "ERROR: Neither docker nor podman is installed."
        exit 1
    fi
fi
echo "Container engine: $CONTAINER_ENGINE"

# -------------------------------------------------------------------
# Read teams
# -------------------------------------------------------------------
TEAM_COUNT=$(jq 'length' "$TEAMS_FILE")
if [[ "$TEAM_COUNT" -eq 0 ]]; then
    echo "ERROR: No teams found in $TEAMS_FILE"
    exit 1
fi

TEAM_NAMES=()
TEAM_URLS=()
for i in $(seq 0 $((TEAM_COUNT - 1))); do
    NAME=$(jq -r ".[$i].name" "$TEAMS_FILE")
    URL=$(jq -r ".[$i].repo_url" "$TEAMS_FILE")
    TEAM_NAMES+=("$NAME")
    TEAM_URLS+=("$URL")
done

# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------
mkdir -p "$OUTPUT_DIR"
mkdir -p "$REPOS_DIR"

# Initialize commit tracking if it doesn't exist
if [[ ! -f "$COMMIT_TRACKING_FILE" ]]; then
    echo '{}' > "$COMMIT_TRACKING_FILE"
fi

get_tracked_commit() {
    local team="$1"
    jq -r --arg t "$team" '.[$t] // ""' "$COMMIT_TRACKING_FILE"
}

set_tracked_commit() {
    local team="$1"
    local commit="$2"
    local tmp
    tmp=$(mktemp)
    jq --arg t "$team" --arg c "$commit" '.[$t] = $c' "$COMMIT_TRACKING_FILE" > "$tmp"
    mv "$tmp" "$COMMIT_TRACKING_FILE"
}

get_remote_head() {
    local repo_url="$1"
    git ls-remote --heads "$repo_url" main 2>/dev/null | awk '{print $1}'
}

cleanup_containers() {
    $CONTAINER_ENGINE stop hackathon-team 2>/dev/null || true
    $CONTAINER_ENGINE rm hackathon-team 2>/dev/null || true
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
            echo "    Container ready after ${waited}s"
            return 0
        fi
    done

    echo "    WARNING: Container did not respond within ${max_wait}s"
    return 1
}

wait_for_low_load() {
    local cpu_count
    cpu_count=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
    local threshold
    threshold=$(awk "BEGIN { printf \"%.1f\", $cpu_count * $MAX_LOAD_RATIO }")

    local attempts=0
    while [[ $attempts -lt 30 ]]; do
        local load_1m
        load_1m=$(awk '{print $1}' /proc/loadavg 2>/dev/null || sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}' || echo "0.0")

        if awk "BEGIN { exit ($load_1m <= $threshold) ? 1 : 0 }" 2>/dev/null; then
            sleep 10
            attempts=$((attempts + 1))
        else
            return 0
        fi
    done
}

regenerate_leaderboard() {
    echo "  Regenerating leaderboard..."
    (cd "$TESTING_CLIENT_DIR" && npx ts-node src/index.ts --results-dir "$OUTPUT_DIR" --leaderboard) || {
        echo "  WARNING: Leaderboard generation failed."
    }
}

test_team() {
    local team="$1"
    local repo_url="$2"
    local image_name="hackathon-team-$team:latest"
    local team_repo_dir="$REPOS_DIR/$team"

    echo ""
    echo "  ┌────────────────────────────────────────────────"
    echo "  │ Testing: $team"
    echo "  │ Repo:    $repo_url"
    echo "  └────────────────────────────────────────────────"

    # Cooldown + load check
    wait_for_low_load

    # Clean up any leftover containers
    cleanup_containers

    # Clone
    echo "  [1/5] Cloning..."
    rm -rf "$team_repo_dir"
    if ! git clone --depth 1 "$repo_url" "$team_repo_dir" 2>&1 | tail -1; then
        echo "    ERROR: Clone failed. Skipping."
        echo '{"team":"'"$team"'","error":"Failed to clone repository","timestamp":"'"$(date -Iseconds)"'","total":{"scored":0,"max_scoreable_by_tool":115,"manual_pending":0}}' \
            > "$OUTPUT_DIR/team-$team.json"
        return 1
    fi

    # Validate Dockerfile
    if [[ ! -f "$team_repo_dir/Dockerfile" ]]; then
        echo "    ERROR: No Dockerfile found. Skipping."
        echo '{"team":"'"$team"'","error":"No Dockerfile found","timestamp":"'"$(date -Iseconds)"'","total":{"scored":0,"max_scoreable_by_tool":115,"manual_pending":0}}' \
            > "$OUTPUT_DIR/team-$team.json"
        return 1
    fi

    # Build
    echo "  [2/5] Building image (--no-cache) with $CONTAINER_ENGINE..."
    local build_start
    build_start=$(date +%s)
    if ! timeout "$BUILD_TIMEOUT" $CONTAINER_ENGINE build --no-cache -t "$image_name" "$team_repo_dir" > /dev/null 2>&1; then
        local build_time=$(( $(date +%s) - build_start ))
        echo "    ERROR: Build failed after ${build_time}s. Skipping."
        echo '{"team":"'"$team"'","error":"Container build failed","timestamp":"'"$(date -Iseconds)"'","total":{"scored":0,"max_scoreable_by_tool":115,"manual_pending":0}}' \
            > "$OUTPUT_DIR/team-$team.json"
        cleanup_containers
        return 1
    fi
    local build_time=$(( $(date +%s) - build_start ))
    echo "    Built in ${build_time}s"

    # Start container
    echo "  [3/5] Starting container..."
    $CONTAINER_ENGINE run -d \
        --name hackathon-team \
        -p "$CONTAINER_PORT:8080" \
        "$image_name" > /dev/null

    if ! wait_for_container "http://localhost:$CONTAINER_PORT/calculation-requests"; then
        echo "    ERROR: Container failed to start."
        $CONTAINER_ENGINE logs hackathon-team 2>&1 | tail -10
        echo '{"team":"'"$team"'","error":"Container failed to start","timestamp":"'"$(date -Iseconds)"'","total":{"scored":0,"max_scoreable_by_tool":115,"manual_pending":0}}' \
            > "$OUTPUT_DIR/team-$team.json"
        cleanup_containers
        $CONTAINER_ENGINE rmi "$image_name" > /dev/null 2>&1 || true
        return 1
    fi

    # Get the commit SHA for submission tracking
    local commit_sha
    commit_sha=$(git -C "$team_repo_dir" rev-parse HEAD 2>/dev/null || echo "unknown")

    # Run tests
    echo "  [4/5] Running test suite..."
    local test_cmd=(
        npx ts-node src/index.ts
        --target "http://localhost:$CONTAINER_PORT"
        --team "$team"
        --output "$OUTPUT_DIR/team-$team.json"
        --results-dir "$OUTPUT_DIR"
        --commit-sha "$commit_sha"
        --warmup-requests "$WARMUP_REQUESTS"
        --throughput-duration "$THROUGHPUT_DURATION"
        --concurrency-level "$CONCURRENCY_LEVEL"
        --cold-start-image "$image_name"
    )

    if [[ "$SKIP_COLD_START" == true ]]; then
        test_cmd+=(--skip-cold-start)
    fi

    if [[ "$SKIP_AI_REVIEW" == false && -d "$team_repo_dir" ]]; then
        test_cmd+=(--code-path "$team_repo_dir")
    fi

    (cd "$TESTING_CLIENT_DIR" && timeout "$TEST_TIMEOUT" "${test_cmd[@]}") || {
        echo "    WARNING: Testing client exited with non-zero status"
    }

    # Cleanup
    echo "  [5/5] Cleaning up..."
    cleanup_containers
    $CONTAINER_ENGINE rmi "$image_name" > /dev/null 2>&1 || true
    $CONTAINER_ENGINE image prune -f > /dev/null 2>&1 || true
    $CONTAINER_ENGINE builder prune -f > /dev/null 2>&1 || true

    echo "  Done: $team"
    return 0
}

# -------------------------------------------------------------------
# Main loop
# -------------------------------------------------------------------
echo "============================================"
echo "  Continuous Testing Runner"
echo "============================================"
echo ""
echo "Teams:          ${TEAM_NAMES[*]}"
echo "Total teams:    $TEAM_COUNT"
echo "Poll interval:  ${POLL_INTERVAL}s"
echo "Output:         $OUTPUT_DIR"
echo "Tracking:       $COMMIT_TRACKING_FILE"
echo "Run once:       $RUN_ONCE"
echo ""

CYCLE=0

while true; do
    CYCLE=$((CYCLE + 1))
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Polling cycle #$CYCLE — $(date '+%H:%M:%S')"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    TEAMS_TESTED=0

    for i in $(seq 0 $((TEAM_COUNT - 1))); do
        TEAM="${TEAM_NAMES[$i]}"
        REPO_URL="${TEAM_URLS[$i]}"

        # Get the latest commit on main
        REMOTE_HEAD=$(get_remote_head "$REPO_URL")

        if [[ -z "$REMOTE_HEAD" ]]; then
            echo "  ⚠ $TEAM: Could not fetch remote HEAD. Skipping."
            continue
        fi

        # Check against last tested commit
        LAST_TESTED=$(get_tracked_commit "$TEAM")

        if [[ "$REMOTE_HEAD" == "$LAST_TESTED" ]]; then
            echo "  ✓ $TEAM: No changes (${REMOTE_HEAD:0:8})"
            continue
        fi

        if [[ -z "$LAST_TESTED" ]]; then
            echo "  ★ $TEAM: First test (${REMOTE_HEAD:0:8})"
        else
            echo "  ↻ $TEAM: New commit (${LAST_TESTED:0:8} → ${REMOTE_HEAD:0:8})"
        fi

        # Cooldown between team tests
        if [[ $TEAMS_TESTED -gt 0 ]]; then
            echo "  Cooldown ${COOLDOWN_SECONDS}s..."
            sleep "$COOLDOWN_SECONDS"
        fi

        # Test the team
        if test_team "$TEAM" "$REPO_URL"; then
            set_tracked_commit "$TEAM" "$REMOTE_HEAD"
        else
            # Still track the commit so we don't retry failures endlessly
            set_tracked_commit "$TEAM" "$REMOTE_HEAD"
        fi

        TEAMS_TESTED=$((TEAMS_TESTED + 1))

        # Regenerate leaderboard after each team
        regenerate_leaderboard
    done

    if [[ $TEAMS_TESTED -eq 0 ]]; then
        echo ""
        echo "  No changes detected across any team."
    else
        echo ""
        echo "  Tested $TEAMS_TESTED team(s) this cycle."
    fi

    if [[ "$RUN_ONCE" == true ]]; then
        echo ""
        echo "Run-once mode: exiting."
        exit 0
    fi

    echo "  Next poll in ${POLL_INTERVAL}s... (Ctrl+C to stop)"
    sleep "$POLL_INTERVAL"
done
