#!/usr/bin/env bash
#
# test-ai-review-local.sh -- Test AI code review locally on a team repository.
#
# Usage:
#   export ANTHROPIC_API_KEY="sk-ant-..."  # or OPENAI_API_KEY
#   ./test-ai-review-local.sh vavrek-warriors
#
set -euo pipefail

TEAM="${1:-}"
OPENAI_KEY="${2:-}"

if [[ -z "$TEAM" ]]; then
    echo "Usage: $0 <team-name> [openai-api-key]"
    echo "Example: $0 vavrek-warriors"
    echo "         $0 vavrek-warriors sk-your-key-here"
    echo ""
    echo "Or set environment variable:"
    echo "  export OPENAI_API_KEY='sk-your-key-here'"
    echo "  $0 vavrek-warriors"
    exit 1
fi

REPO_URL="https://github.com/VismaKosice/hackathon-team-${TEAM}.git"
TEST_DIR="/tmp/hackathon-test-${TEAM}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TESTING_CLIENT_DIR="$SCRIPT_DIR/../testing-client"

# Set API key if provided as argument
if [[ -n "$OPENAI_KEY" ]]; then
    export OPENAI_API_KEY="$OPENAI_KEY"
fi

# Check API key
if [[ -z "${ANTHROPIC_API_KEY:-}" ]] && [[ -z "${OPENAI_API_KEY:-}" ]]; then
    echo "ERROR: No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY"
    echo ""
    echo "Example:"
    echo "  export OPENAI_API_KEY='sk-your-key-here'"
    echo "  $0 $TEAM"
    echo ""
    echo "Or pass as argument:"
    echo "  $0 $TEAM sk-your-key-here"
    exit 1
fi

echo "=== Testing AI Code Review for $TEAM ==="
echo ""

# Clone repository
echo "[1/3] Cloning repository..."
rm -rf "$TEST_DIR"
git clone --depth 1 "$REPO_URL" "$TEST_DIR" > /dev/null 2>&1
echo "  ✓ Cloned to $TEST_DIR"

# Check if code exists (check for common source file extensions)
if [[ ! -d "$TEST_DIR" ]] || [[ -z "$(find "$TEST_DIR" -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.java" -o -name "*.go" -o -name "*.rs" -o -name "*.cpp" -o -name "*.c" \) ! -path "*/.git/*" ! -path "*/node_modules/*" | head -1)" ]]; then
    echo "  ⚠ Warning: No common source code files found in repository"
else
    SOURCE_COUNT=$(find "$TEST_DIR" -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.java" -o -name "*.go" -o -name "*.rs" -o -name "*.cpp" -o -name "*.c" \) ! -path "*/.git/*" ! -path "*/node_modules/*" | wc -l | tr -d ' ')
    echo "  ✓ Found $SOURCE_COUNT source files"
fi

# Run AI code review only
echo ""
echo "[2/3] Running AI code review..."
cd "$TESTING_CLIENT_DIR"

# Start a minimal mock HTTP server for health check (AI review doesn't need real API)
echo "  Starting mock HTTP server for health check..."
MOCK_PORT=9999
node -e "
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end('{}');
});
server.listen($MOCK_PORT, () => {
  console.log('Mock server ready');
});
" > /tmp/mock-server.log 2>&1 &
MOCK_PID=$!
sleep 2

# Cleanup function
cleanup() {
    kill $MOCK_PID 2>/dev/null || true
    wait $MOCK_PID 2>/dev/null || true
}
trap cleanup EXIT

echo "  Analyzing code in: $TEST_DIR"
echo "  (Mock server running on port $MOCK_PORT for health check)"
echo ""

# Run bonus suite which includes AI code review
# The AI review will analyze code quality and clean architecture
npx ts-node src/index.ts \
    --target "http://localhost:$MOCK_PORT" \
    --team "$TEAM" \
    --suite "bonus" \
    --code-path "$TEST_DIR" \
    --output "/tmp/test-ai-review-${TEAM}.json" \
    2>&1 | tee /tmp/test-ai-review-output.log

TEST_EXIT_CODE=${PIPESTATUS[0]}
cleanup
trap - EXIT

# Exit with test result code
exit $TEST_EXIT_CODE

echo ""
echo "[3/3] Results saved to /tmp/test-ai-review-${TEAM}.json"
echo ""

# Show AI review results
if [[ -f "/tmp/test-ai-review-${TEAM}.json" ]]; then
    echo "=== AI Code Review Results ==="
    echo ""
    echo "Code Quality Scores:"
    cat "/tmp/test-ai-review-${TEAM}.json" | jq -r '.code_quality | "  Readability: \(.readability_and_organization)/3\n  Error Handling: \(.error_handling)/3\n  Project Structure: \(.project_structure)/2\n  Total: \(.points)/5"' 2>/dev/null || echo "  (Check JSON file for details)"
    echo ""
    echo "Clean Architecture Scores:"
    cat "/tmp/test-ai-review-${TEAM}.json" | jq -r '.bonus.clean_architecture | "  Common Interface: \(.common_interface)/2\n  Per-Mutation Implementation: \(.per_mutation_implementation)/2\n  Generic Dispatch: \(.generic_dispatch)/2\n  Extensibility: \(.extensibility)/2\n  Total: \(.points)/8"' 2>/dev/null || echo "  (Check JSON file for details)"
    echo ""
fi

echo "=== Review Complete ==="
echo ""
echo "Full results:"
echo "  cat /tmp/test-ai-review-${TEAM}.json | jq"
echo ""
echo "Cleanup:"
echo "  rm -rf $TEST_DIR /tmp/test-ai-review-${TEAM}.json /tmp/test-ai-review-output.log"
