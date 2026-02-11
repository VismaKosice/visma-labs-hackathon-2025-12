#!/usr/bin/env bash
#
# Test runner for the Pension Calculation Engine
#
# Usage:
#   ./test-cases/run-tests.sh                    # Run all tests against localhost:8080
#   ./test-cases/run-tests.sh http://localhost:3000  # Run against a custom URL
#   ./test-cases/run-tests.sh http://localhost:8080 C07  # Run a single test case
#
# Prerequisites:
#   - curl and jq must be installed
#   - Your engine must be running and accessible
#
# What this script checks:
#   - HTTP status code matches expected
#   - calculation_outcome matches (SUCCESS/FAILURE)
#   - messages array matches (level + code for each message)
#   - end_situation deep comparison (with 0.01 numeric tolerance)
#   - end_situation metadata (mutation_id, mutation_index, actual_at)
#   - mutations_processed_count
#

set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"
FILTER="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENDPOINT="${BASE_URL}/calculation-requests"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
SKIPPED=0
ERRORS=()

# Check dependencies
for cmd in curl jq; do
  if ! command -v "$cmd" &> /dev/null; then
    echo -e "${RED}Error: '$cmd' is required but not installed.${NC}"
    exit 1
  fi
done

# Check if server is reachable
echo -e "${CYAN}Testing connection to ${BASE_URL}...${NC}"
if ! curl -sf -o /dev/null --connect-timeout 3 "${BASE_URL}" 2>/dev/null; then
  # Try the endpoint directly (some servers only respond on specific routes)
  if ! curl -sf -o /dev/null --connect-timeout 3 -X POST "${ENDPOINT}" -H "Content-Type: application/json" -d '{}' 2>/dev/null; then
    echo -e "${YELLOW}Warning: Could not connect to ${BASE_URL}. Make sure your server is running.${NC}"
    echo -e "${DIM}Continuing anyway in case the server only responds to valid requests...${NC}"
  fi
fi
echo ""

# Compare numbers with tolerance
numbers_equal() {
  local a="$1" b="$2" tolerance="0.01"
  jq -n --argjson a "$a" --argjson b "$b" --argjson t "$tolerance" \
    'if ($a == null and $b == null) then true
     elif ($a == null or $b == null) then false
     elif ($a == 0 and $b == 0) then true
     else (($a - $b) | fabs) <= $t end'
}

# Deep compare two JSON objects with numeric tolerance
# Returns "true" if they match, otherwise returns a description of the first mismatch
deep_compare() {
  local expected="$1" actual="$2" path="$3"

  local exp_type act_type
  exp_type=$(echo "$expected" | jq -r 'type')
  act_type=$(echo "$actual" | jq -r 'type')

  if [ "$exp_type" != "$act_type" ]; then
    # Special case: number vs null
    echo "Type mismatch at ${path}: expected ${exp_type}, got ${act_type}"
    return 0
  fi

  case "$exp_type" in
    "null")
      echo "true"
      ;;
    "number")
      local result
      result=$(numbers_equal "$expected" "$actual")
      if [ "$result" = "true" ]; then
        echo "true"
      else
        echo "Numeric mismatch at ${path}: expected ${expected}, got ${actual}"
      fi
      ;;
    "string"|"boolean")
      # Case-insensitive comparison for UUIDs, exact for others
      local exp_val act_val
      exp_val=$(echo "$expected" | jq -r '.')
      act_val=$(echo "$actual" | jq -r '.')
      if [ "$exp_val" = "$act_val" ] || [ "$(echo "$exp_val" | tr '[:upper:]' '[:lower:]')" = "$(echo "$act_val" | tr '[:upper:]' '[:lower:]')" ]; then
        echo "true"
      else
        echo "Value mismatch at ${path}: expected '${exp_val}', got '${act_val}'"
      fi
      ;;
    "array")
      local exp_len act_len
      exp_len=$(echo "$expected" | jq 'length')
      act_len=$(echo "$actual" | jq 'length')
      if [ "$exp_len" != "$act_len" ]; then
        echo "Array length mismatch at ${path}: expected ${exp_len}, got ${act_len}"
        return 0
      fi
      for ((i=0; i<exp_len; i++)); do
        local exp_item act_item
        exp_item=$(echo "$expected" | jq ".[$i]")
        act_item=$(echo "$actual" | jq ".[$i]")
        local result
        result=$(deep_compare "$exp_item" "$act_item" "${path}[$i]")
        if [ "$result" != "true" ]; then
          echo "$result"
          return 0
        fi
      done
      echo "true"
      ;;
    "object")
      local keys
      keys=$(echo "$expected" | jq -r 'keys[]')
      for key in $keys; do
        local exp_val act_val
        exp_val=$(echo "$expected" | jq ".\"$key\"")
        act_val=$(echo "$actual" | jq ".\"$key\"")
        if [ "$act_val" = "null" ] && [ "$exp_val" != "null" ]; then
          local has_key
          has_key=$(echo "$actual" | jq "has(\"$key\")")
          if [ "$has_key" = "false" ]; then
            echo "Missing key at ${path}.${key}"
            return 0
          fi
        fi
        local result
        result=$(deep_compare "$exp_val" "$act_val" "${path}.${key}")
        if [ "$result" != "true" ]; then
          echo "$result"
          return 0
        fi
      done
      echo "true"
      ;;
  esac
}

run_test() {
  local test_file="$1"
  local test_id test_name test_desc request expected

  test_id=$(jq -r '.id' "$test_file")
  test_name=$(jq -r '.name' "$test_file")
  test_desc=$(jq -r '.description' "$test_file")

  # Filter by test ID if specified
  if [ -n "$FILTER" ] && [ "$test_id" != "$FILTER" ]; then
    return
  fi

  echo -e "${BOLD}[$test_id] $test_name${NC}"
  echo -e "${DIM}  $test_desc${NC}"

  request=$(jq '.request' "$test_file")
  expected_http=$(jq -r '.expected.http_status' "$test_file")
  expected_outcome=$(jq -r '.expected.calculation_outcome' "$test_file")
  expected_message_count=$(jq -r '.expected.message_count' "$test_file")
  expected_messages=$(jq '.expected.messages' "$test_file")
  expected_end_situation=$(jq '.expected.end_situation' "$test_file")
  expected_mutation_id=$(jq -r '.expected.end_situation_mutation_id' "$test_file")
  expected_mutation_index=$(jq -r '.expected.end_situation_mutation_index' "$test_file")
  expected_actual_at=$(jq -r '.expected.end_situation_actual_at' "$test_file")
  expected_mutations_count=$(jq -r '.expected.mutations_processed_count' "$test_file")

  # Send request
  local http_code response
  local tmpfile
  tmpfile=$(mktemp)

  http_code=$(curl -s -o "$tmpfile" -w '%{http_code}' \
    -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "$request" 2>/dev/null) || {
    echo -e "  ${RED}FAIL: Could not connect to server${NC}"
    FAILED=$((FAILED + 1))
    ERRORS+=("$test_id: Connection failed")
    rm -f "$tmpfile"
    echo ""
    return
  }

  response=$(cat "$tmpfile")
  rm -f "$tmpfile"

  local test_failed=false
  local failure_reasons=()

  # Check HTTP status
  if [ "$http_code" != "$expected_http" ]; then
    failure_reasons+=("HTTP status: expected $expected_http, got $http_code")
    test_failed=true
  fi

  # Check if response is valid JSON
  if ! echo "$response" | jq . &>/dev/null; then
    failure_reasons+=("Response is not valid JSON")
    test_failed=true
    echo -e "  ${RED}FAIL${NC}"
    for reason in "${failure_reasons[@]}"; do
      echo -e "    ${RED}- $reason${NC}"
    done
    FAILED=$((FAILED + 1))
    ERRORS+=("$test_id: ${failure_reasons[*]}")
    echo ""
    return
  fi

  # Check calculation_outcome
  local actual_outcome
  actual_outcome=$(echo "$response" | jq -r '.calculation_metadata.calculation_outcome // empty')
  if [ "$actual_outcome" != "$expected_outcome" ]; then
    failure_reasons+=("calculation_outcome: expected '$expected_outcome', got '$actual_outcome'")
    test_failed=true
  fi

  # Check messages count
  local actual_message_count
  actual_message_count=$(echo "$response" | jq '.calculation_result.messages | length')
  if [ "$actual_message_count" != "$expected_message_count" ]; then
    failure_reasons+=("message_count: expected $expected_message_count, got $actual_message_count")
    test_failed=true
  fi

  # Check message level and code
  local exp_msg_len
  exp_msg_len=$(echo "$expected_messages" | jq 'length')
  for ((i=0; i<exp_msg_len; i++)); do
    local exp_level exp_code act_level act_code
    exp_level=$(echo "$expected_messages" | jq -r ".[$i].level")
    exp_code=$(echo "$expected_messages" | jq -r ".[$i].code")
    act_level=$(echo "$response" | jq -r ".calculation_result.messages[$i].level // empty")
    act_code=$(echo "$response" | jq -r ".calculation_result.messages[$i].code // empty")
    if [ "$act_level" != "$exp_level" ] || [ "$act_code" != "$exp_code" ]; then
      failure_reasons+=("message[$i]: expected ${exp_level}/${exp_code}, got ${act_level}/${act_code}")
      test_failed=true
    fi
  done

  # Check mutations processed count
  local actual_mutations_count
  actual_mutations_count=$(echo "$response" | jq '.calculation_result.mutations | length')
  if [ "$actual_mutations_count" != "$expected_mutations_count" ]; then
    failure_reasons+=("mutations_processed_count: expected $expected_mutations_count, got $actual_mutations_count")
    test_failed=true
  fi

  # Check end_situation metadata
  local actual_mutation_id actual_mutation_index actual_actual_at
  actual_mutation_id=$(echo "$response" | jq -r '.calculation_result.end_situation.mutation_id // empty')
  actual_mutation_index=$(echo "$response" | jq -r '.calculation_result.end_situation.mutation_index // empty')
  actual_actual_at=$(echo "$response" | jq -r '.calculation_result.end_situation.actual_at // empty')

  if [ "$(echo "$actual_mutation_id" | tr '[:upper:]' '[:lower:]')" != "$(echo "$expected_mutation_id" | tr '[:upper:]' '[:lower:]')" ]; then
    failure_reasons+=("end_situation.mutation_id: expected '$expected_mutation_id', got '$actual_mutation_id'")
    test_failed=true
  fi
  if [ "$actual_mutation_index" != "$expected_mutation_index" ]; then
    failure_reasons+=("end_situation.mutation_index: expected $expected_mutation_index, got $actual_mutation_index")
    test_failed=true
  fi
  if [ "$actual_actual_at" != "$expected_actual_at" ]; then
    failure_reasons+=("end_situation.actual_at: expected '$expected_actual_at', got '$actual_actual_at'")
    test_failed=true
  fi

  # Deep compare end_situation.situation
  local actual_situation
  actual_situation=$(echo "$response" | jq '.calculation_result.end_situation.situation')
  local compare_result
  compare_result=$(deep_compare "$expected_end_situation" "$actual_situation" "end_situation.situation")
  if [ "$compare_result" != "true" ]; then
    failure_reasons+=("$compare_result")
    test_failed=true
  fi

  # Report results
  if [ "$test_failed" = true ]; then
    echo -e "  ${RED}FAIL${NC}"
    for reason in "${failure_reasons[@]}"; do
      echo -e "    ${RED}- $reason${NC}"
    done
    FAILED=$((FAILED + 1))
    ERRORS+=("$test_id: ${failure_reasons[0]}")
  else
    echo -e "  ${GREEN}PASS${NC}"
    PASSED=$((PASSED + 1))
  fi
  echo ""
}

# Header
echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD} Pension Calculation Engine - Test Suite${NC}"
echo -e "${BOLD}========================================${NC}"
echo -e "${DIM}Target: ${ENDPOINT}${NC}"
echo ""

# Run core correctness tests (C01-C10)
echo -e "${CYAN}--- Core Correctness Tests (scored) ---${NC}"
echo ""
for test_file in "$SCRIPT_DIR"/C{01,02,03,04,05,06,07,08,09,10}-*.json; do
  [ -f "$test_file" ] && run_test "$test_file"
done

# Run warning edge case tests (C11-C14)
echo -e "${CYAN}--- Warning/Edge Case Tests (extra validation) ---${NC}"
echo ""
for test_file in "$SCRIPT_DIR"/C{11,12,13,14}-*.json; do
  [ -f "$test_file" ] && run_test "$test_file"
done

# Run bonus tests
echo -e "${CYAN}--- Bonus Tests ---${NC}"
echo ""
for test_file in "$SCRIPT_DIR"/B*.json; do
  [ -f "$test_file" ] && run_test "$test_file"
done

# Summary
TOTAL=$((PASSED + FAILED))
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD} Results: ${GREEN}${PASSED} passed${NC}, ${RED}${FAILED} failed${NC} ${DIM}(${TOTAL} total)${NC}"
echo -e "${BOLD}========================================${NC}"

if [ ${#ERRORS[@]} -gt 0 ]; then
  echo ""
  echo -e "${YELLOW}Failed tests:${NC}"
  for err in "${ERRORS[@]}"; do
    echo -e "  ${RED}- $err${NC}"
  done
fi

echo ""
if [ "$FAILED" -eq 0 ] && [ "$TOTAL" -gt 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  exit 1
fi
