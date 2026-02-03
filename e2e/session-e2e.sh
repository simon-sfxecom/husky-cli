#!/bin/bash
# =============================================================================
# E2E Tests for Session Logging System
# =============================================================================
# Run with: ./e2e/session-e2e.sh [API_URL]
# Default API_URL: https://husky-api-sandbox-474966775596.europe-west1.run.app
# =============================================================================

set -e

API_URL="${1:-https://husky-api-sandbox-474966775596.europe-west1.run.app}"
CLI="node dist/index.js"
PASSED=0
FAILED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_test() {
  echo -e "${YELLOW}[TEST]${NC} $1"
}

log_pass() {
  echo -e "${GREEN}[PASS]${NC} $1"
  PASSED=$((PASSED + 1))
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  FAILED=$((FAILED + 1))
}

# Override API URL for testing
export HUSKY_API_URL="$API_URL"

echo "=============================================="
echo "  Session Logging E2E Tests"
echo "  API: $API_URL"
echo "=============================================="
echo ""

# -----------------------------------------------------------------------------
# Test 1: Session Init
# -----------------------------------------------------------------------------
log_test "Session Init"
INIT_RESULT=$($CLI session init --vm-name "e2e-test-vm" --agent-id "e2e-test-agent" --json 2>&1) || true

if echo "$INIT_RESULT" | grep -q '"success":true'; then
  SESSION_ID=$(echo "$INIT_RESULT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  log_pass "Session created: $SESSION_ID"
else
  log_fail "Session init failed: $INIT_RESULT"
  SESSION_ID=""
fi

# -----------------------------------------------------------------------------
# Test 2: Session Current
# -----------------------------------------------------------------------------
log_test "Session Current"
CURRENT_RESULT=$($CLI session current --json 2>&1) || true

if echo "$CURRENT_RESULT" | grep -q '"sessionId"'; then
  log_pass "Current session found"
else
  log_fail "Current session not found: $CURRENT_RESULT"
fi

# -----------------------------------------------------------------------------
# Test 3: Session Log (buffered)
# -----------------------------------------------------------------------------
log_test "Session Log (buffered)"
LOG_RESULT=$($CLI session log \
  --tool "Bash" \
  --input "echo hello" \
  --output "hello" \
  --status "success" \
  --buffer \
  --json 2>&1) || true

if echo "$LOG_RESULT" | grep -q '"buffered":true'; then
  log_pass "Log buffered successfully"
else
  log_fail "Log buffering failed: $LOG_RESULT"
fi

# -----------------------------------------------------------------------------
# Test 4: Session Log (with error)
# -----------------------------------------------------------------------------
log_test "Session Log (error)"
LOG_ERROR=$($CLI session log \
  --tool "Bash" \
  --input "exit 1" \
  --output "Command failed" \
  --status "error" \
  --error-type "CommandError" \
  --buffer \
  --json 2>&1) || true

if echo "$LOG_ERROR" | grep -q '"buffered":true'; then
  log_pass "Error log buffered"
else
  log_fail "Error log buffering failed: $LOG_ERROR"
fi

# -----------------------------------------------------------------------------
# Test 5: Session Export
# -----------------------------------------------------------------------------
if [ -n "$SESSION_ID" ]; then
  log_test "Session Export"
  EXPORT_RESULT=$($CLI session export --session-id "$SESSION_ID" --to-firestore --json 2>&1) || true

  if echo "$EXPORT_RESULT" | grep -q '"success":true\|"logsImported"'; then
    log_pass "Session exported successfully"
  else
    log_fail "Session export failed: $EXPORT_RESULT"
  fi
else
  log_fail "Skipping export test (no session ID)"
fi

# -----------------------------------------------------------------------------
# Test 6: Session List
# -----------------------------------------------------------------------------
log_test "Session List"
LIST_RESULT=$($CLI session list --limit 5 --json 2>&1) || true

if echo "$LIST_RESULT" | grep -q '"sessions"'; then
  log_pass "Session list retrieved"
else
  log_fail "Session list failed: $LIST_RESULT"
fi

# -----------------------------------------------------------------------------
# Test 7: Session Search
# -----------------------------------------------------------------------------
log_test "Session Search"
SEARCH_RESULT=$($CLI session search "test query" --json 2>&1) || true

if echo "$SEARCH_RESULT" | grep -q '"results"'; then
  log_pass "Session search executed"
else
  log_fail "Session search failed: $SEARCH_RESULT"
fi

# -----------------------------------------------------------------------------
# Test 8: Insights Errors
# -----------------------------------------------------------------------------
log_test "Insights Errors"
ERRORS_RESULT=$($CLI insights errors --since 7d --json 2>&1) || true

if echo "$ERRORS_RESULT" | grep -q '"errors"\|"count"'; then
  log_pass "Insights errors retrieved"
else
  log_fail "Insights errors failed: $ERRORS_RESULT"
fi

# -----------------------------------------------------------------------------
# Test 9: Insights Learnings
# -----------------------------------------------------------------------------
log_test "Insights Learnings"
LEARNINGS_RESULT=$($CLI insights learnings --since 7d --json 2>&1) || true

if echo "$LEARNINGS_RESULT" | grep -q '"learnings"\|"count"'; then
  log_pass "Insights learnings retrieved"
else
  log_fail "Insights learnings failed: $LEARNINGS_RESULT"
fi

# -----------------------------------------------------------------------------
# Test 10: Insights Stats
# -----------------------------------------------------------------------------
log_test "Insights Stats"
STATS_RESULT=$($CLI insights stats --since 7d --json 2>&1) || true

if echo "$STATS_RESULT" | grep -q '"stats"\|"totalSessions"'; then
  log_pass "Insights stats retrieved"
else
  log_fail "Insights stats failed: $STATS_RESULT"
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo ""
echo "=============================================="
echo "  Test Results"
echo "=============================================="
echo -e "  ${GREEN}Passed: $PASSED${NC}"
echo -e "  ${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed.${NC}"
  exit 1
fi
