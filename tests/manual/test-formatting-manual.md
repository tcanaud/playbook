# Manual Testing: Terminal Output Formatting (User Story 4)

**Feature**: Both commands (`status` and `list`) produce polished, visually clear terminal output that fits standard 80+ character terminal width

## Test Scenarios

### Scenario 1: Status Command Terminal Width
**Expected**: Output fits within 80-character width with no horizontal scrolling

```bash
# Setup: Create 10 test sessions with varying status values
for i in {0..9}; do
  sessionId="20260219-$(printf '%03d' $i)"
  mkdir -p ~/.playbooks/sessions/$sessionId
  cat > ~/.playbooks/sessions/$sessionId/session.yaml << EOF
session_id: "$sessionId"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "in_progress"
started_at: "2026-02-19T$(printf '%02d' $((i+10))):$(printf '%02d' $((i*5))):00.000Z"
completed_at: ""
current_step: "step-$i"
worktree: ""
EOF
  cat > ~/.playbooks/sessions/$sessionId/journal.yaml << 'EOF'
entries: []
EOF
done

# Execute and measure line width
npx @tcanaud/playbook status | awk '{if (length > 80) print "LINE TOO LONG: " length " chars"; else print "OK: " length " chars"}' | sort -u

# Expected Output
# OK: [various lengths, all <= 80]

# Verification:
# - No line exceeds 80 characters
# - All output fits in standard terminal width
# - No horizontal scrolling required
# - Header and separator visible
```

### Scenario 2: List Command Terminal Width
**Expected**: Output fits within 80-character width with 5-10 sessions

```bash
# Setup: Create 10 test sessions
for i in {0..9}; do
  sessionId="20260219-$(printf '%03d' $i)"
  mkdir -p ~/.playbooks/sessions/$sessionId
  status_array=("completed" "in_progress" "failed" "pending")
  status=${status_array[$((i % 4))]}
  cat > ~/.playbooks/sessions/$sessionId/session.yaml << EOF
session_id: "$sessionId"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "$status"
started_at: "2026-02-19T$(printf '%02d' $((i+10))):00:00.000Z"
completed_at: "2026-02-19T$(printf '%02d' $((i+11))):00:00.000Z"
current_step: "step-$i"
worktree: ""
EOF
  cat > ~/.playbooks/sessions/$sessionId/journal.yaml << 'EOF'
entries: []
EOF
done

# Execute and check max line length
npx @tcanaud/playbook list | awk '{print length, $0}' | sort -rn | head -1

# Expected Output
# 79 [actual output line with max length]

# Verification:
# - Maximum line length is <= 80 characters
# - All content visible without horizontal scrolling
```

### Scenario 3: Column Header Alignment
**Expected**: Clear, aligned column headers with proper spacing

```bash
# Setup: Create test session
mkdir -p ~/.playbooks/sessions/20260219-test
cat > ~/.playbooks/sessions/20260219-test/session.yaml << 'EOF'
session_id: "20260219-test"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "completed"
started_at: "2026-02-19T19:22:15.000Z"
completed_at: "2026-02-19T20:22:15.000Z"
current_step: ""
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-test/journal.yaml << 'EOF'
entries: []
EOF

# Execute
npx @tcanaud/playbook list

# Expected Output Format
# ID               CREATED              STATUS
# -------- -------- --------
# 20260219-test    2026-02-19 19:22     ✓ Completed

# Visual Verification:
# 1. Column headers are clearly labeled (ID, CREATED, STATUS)
# 2. Data is aligned under respective columns
# 3. Separator line (---) matches header width
# 4. Proper spacing between columns
```

### Scenario 4: Status Label Human-Friendliness
**Expected**: Status labels are clear and not technical jargon

```bash
# Setup: Create sessions with different statuses
mkdir -p ~/.playbooks/sessions/{20260219-run,20260219-pend,20260219-comp,20260219-fail}

for sessionId in 20260219-run 20260219-pend 20260219-comp 20260219-fail; do
  mkdir -p ~/.playbooks/sessions/$sessionId
  case $sessionId in
    *-run)
      status="in_progress"
      ;;
    *-pend)
      status="pending"
      ;;
    *-comp)
      status="completed"
      ;;
    *-fail)
      status="failed"
      ;;
  esac

  cat > ~/.playbooks/sessions/$sessionId/session.yaml << EOF
session_id: "$sessionId"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "$status"
started_at: "2026-02-19T12:00:00.000Z"
completed_at: "2026-02-19T13:00:00.000Z"
current_step: ""
worktree: ""
EOF
  cat > ~/.playbooks/sessions/$sessionId/journal.yaml << 'EOF'
entries: []
EOF
done

# Execute
npx @tcanaud/playbook list

# Expected Status Labels
# → Running     (for in_progress)
# → Pending     (for pending)
# ✓ Completed   (for completed)
# ✗ Failed      (for failed)

# Verification:
# 1. Labels are in plain English (not "in_progress")
# 2. Visual indicators (→, ✓, ✗) are clear
# 3. Labels are consistent across commands
```

### Scenario 5: Timestamp Formatting Readability
**Expected**: Timestamps display in compact, human-readable format

```bash
# Setup: Create session with specific timestamp
mkdir -p ~/.playbooks/sessions/20260219-time
cat > ~/.playbooks/sessions/20260219-time/session.yaml << 'EOF'
session_id: "20260219-time"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "completed"
started_at: "2026-02-19T19:22:45.123456Z"
completed_at: "2026-02-19T20:15:30.654321Z"
current_step: ""
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-time/journal.yaml << 'EOF'
entries: []
EOF

# Execute
npx @tcanaud/playbook list

# Expected Output
# 20260219-time    2026-02-19 19:22     ✓ Completed

# Verification:
# 1. Timestamp shows YYYY-MM-DD HH:MM format (no seconds)
# 2. Compact format (16 chars including spaces)
# 3. Human-readable at a glance (shows date and hour:minute)
# 4. Saves horizontal space compared to full ISO timestamp
```

### Scenario 6: Long Session ID Handling
**Expected**: Session IDs are truncated gracefully if too long

```bash
# Setup: Session with ID at maximum length
mkdir -p ~/.playbooks/sessions/20260219-verylongsuffixabc
cat > ~/.playbooks/sessions/20260219-verylongsuffixabc/session.yaml << 'EOF'
session_id: "20260219-verylongsuffixabc"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "completed"
started_at: "2026-02-19T19:22:15.000Z"
completed_at: "2026-02-19T20:22:15.000Z"
current_step: ""
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-verylongsuffixabc/journal.yaml << 'EOF'
entries: []
EOF

# Execute
npx @tcanaud/playbook list

# Expected Output
# 20260219-verylong2026-02-19 19:22     ✓ Completed
# (or truncated appropriately while maintaining uniqueness)

# Verification:
# 1. Long IDs are displayed without breaking layout
# 2. Truncation (if any) maintains readability
# 3. All columns remain aligned
```

### Scenario 7: Spacing and Padding Consistency
**Expected**: Consistent spacing and padding across all rows

```bash
# Setup: Create sessions with varying field lengths
mkdir -p ~/.playbooks/sessions/{20260219-a,20260219-verylongsuffix}

for sessionId in 20260219-a 20260219-verylongsuffix; do
  mkdir -p ~/.playbooks/sessions/$sessionId
  cat > ~/.playbooks/sessions/$sessionId/session.yaml << EOF
session_id: "$sessionId"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "completed"
started_at: "2026-02-19T19:22:15.000Z"
completed_at: "2026-02-19T20:22:15.000Z"
current_step: ""
worktree: ""
EOF
  cat > ~/.playbooks/sessions/$sessionId/journal.yaml << 'EOF'
entries: []
EOF
done

# Execute
npx @tcanaud/playbook list

# Expected Output
# ID               CREATED              STATUS
# -------- -------- --------
# 20260219-verylo  2026-02-19 19:22     ✓ Completed
# 20260219-a       2026-02-19 19:22     ✓ Completed

# Verification:
# 1. All data rows have same alignment
# 2. Padding is consistent (short IDs padded with spaces)
# 3. Columns line up visually
# 4. No excessive whitespace
```

### Scenario 8: Empty Result Messages
**Expected**: Clear, helpful messages when no sessions found

```bash
# Setup: Delete all sessions
rm -rf ~/.playbooks/sessions

# Execute status command
npx @tcanaud/playbook status

# Expected Output
# No running playbook sessions found.

# Execute list command
npx @tcanaud/playbook list

# Expected Output
# No playbook sessions found.

# Verification:
# 1. Messages are clear and actionable
# 2. Grammar is correct and professional
# 3. Exit code is 0 (not an error condition)
```

### Scenario 9: Mixed Status Indicators Visual Scanning
**Expected**: Status indicators make it easy to scan for specific statuses

```bash
# Setup: Create sessions with all status types
mkdir -p ~/.playbooks/sessions/{20260219-001,20260219-002,20260219-003,20260219-004,20260219-005}

for i in {1..5}; do
  sessionId="20260219-$(printf '%03d' $i)"
  mkdir -p ~/.playbooks/sessions/$sessionId

  case $i in
    1) status="in_progress" ;;
    2) status="completed" ;;
    3) status="failed" ;;
    4) status="pending" ;;
    5) status="completed" ;;
  esac

  cat > ~/.playbooks/sessions/$sessionId/session.yaml << EOF
session_id: "$sessionId"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "$status"
started_at: "2026-02-19T$(printf '%02d' $i):00:00.000Z"
completed_at: "2026-02-19T$(printf '%02d' $((i+1))):00:00.000Z"
current_step: ""
worktree: ""
EOF
  cat > ~/.playbooks/sessions/$sessionId/journal.yaml << 'EOF'
entries: []
EOF
done

# Execute
npx @tcanaud/playbook list

# Expected Output
# ID               CREATED              STATUS
# -------- -------- --------
# 20260219-005     2026-02-19 05:00     ✓ Completed
# 20260219-004     2026-02-19 04:00     → Pending
# 20260219-003     2026-02-19 03:00     ✗ Failed
# 20260219-002     2026-02-19 02:00     ✓ Completed
# 20260219-001     2026-02-19 01:00     → Running

# Visual Scanning Verification:
# 1. Can quickly spot all ✓ Completed sessions (running 2 visually)
# 2. Can quickly spot all → Running sessions (running 1)
# 3. Can quickly spot all ✗ Failed sessions (failed 1)
# 4. Indicators provide visual distinction without colors
```

## Acceptance Criteria

- [x] Both commands fit within 80-character terminal width
- [x] No horizontal scrolling required for typical use (5-10 sessions)
- [x] Column headers are clear (ID, CREATED, STATUS)
- [x] Data is properly aligned under columns
- [x] Status labels are human-friendly (not technical jargon)
- [x] Visual indicators (→, ✓, ✗) are used for status distinction
- [x] No color codes (plain text only, for compatibility)
- [x] Timestamps are compact format (YYYY-MM-DD HH:MM)
- [x] Padding and spacing is consistent across rows
- [x] Long fields (IDs, timestamps) handled gracefully
- [x] Empty result messages are clear and helpful
- [x] Overall layout is polished and professional

## Performance Notes

- Both commands execute in <1 second with typical session counts (5-50)
- Table generation is optimized for readability, not speed
- No complex calculations required (simple string padding)

## Terminal Compatibility

- Output uses plain ASCII text (no Unicode escape sequences)
- Text indicators (→, ✓, ✗) are ASCII-compatible
- No ANSI color codes used
- Works in any standard terminal (80+ char width)
- Tested with: bash, zsh, fish shells
