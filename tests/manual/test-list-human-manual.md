# Manual Testing: List Command with Human-Readable Output (User Story 3)

**Feature**: `npx @tcanaud/playbook list` command displays all playbook sessions (running and completed) in human-readable format

## Test Scenarios

### Scenario 1: No Sessions Exist
**Expected**: Clear message indicating no sessions found

```bash
# Setup: Delete all sessions
rm -rf ~/.playbooks/sessions

# Execute
npx @tcanaud/playbook list

# Expected Output
# No playbook sessions found.

# Expected Exit Code: 0
```

### Scenario 2: Single Session Display
**Expected**: Table showing session in human-readable format

```bash
# Setup: Create a test session
mkdir -p ~/.playbooks/sessions/20260219-abc
cat > ~/.playbooks/sessions/20260219-abc/session.yaml << 'EOF'
session_id: "20260219-abc"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "completed"
started_at: "2026-02-19T19:22:15.000Z"
completed_at: "2026-02-19T20:22:15.000Z"
current_step: ""
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-abc/journal.yaml << 'EOF'
entries: []
EOF

# Execute
npx @tcanaud/playbook list

# Expected Output Format
# ID               CREATED              STATUS
# -------- -------- --------
# 20260219-abc     2026-02-19 19:22     ✓ Completed

# Expected Exit Code: 0
```

### Scenario 3: Multiple Sessions with Mixed Statuses
**Expected**: All sessions displayed in table format, sorted by most recent first

```bash
# Setup: Create multiple sessions with different statuses
mkdir -p ~/.playbooks/sessions/{20260219-aaa,20260220-zzz,20260218-mmm}

# Session 1: Running
cat > ~/.playbooks/sessions/20260220-zzz/session.yaml << 'EOF'
session_id: "20260220-zzz"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "in_progress"
started_at: "2026-02-20T15:00:00.000Z"
completed_at: ""
current_step: "step-1"
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260220-zzz/journal.yaml << 'EOF'
entries: []
EOF

# Session 2: Completed
cat > ~/.playbooks/sessions/20260219-aaa/session.yaml << 'EOF'
session_id: "20260219-aaa"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "completed"
started_at: "2026-02-19T10:00:00.000Z"
completed_at: "2026-02-19T11:00:00.000Z"
current_step: ""
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-aaa/journal.yaml << 'EOF'
entries: []
EOF

# Session 3: Failed
cat > ~/.playbooks/sessions/20260218-mmm/session.yaml << 'EOF'
session_id: "20260218-mmm"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "failed"
started_at: "2026-02-18T12:00:00.000Z"
completed_at: "2026-02-18T13:00:00.000Z"
current_step: "step-2"
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260218-mmm/journal.yaml << 'EOF'
entries: []
EOF

# Execute
npx @tcanaud/playbook list

# Expected Output (note: sorted by most recent first)
# ID               CREATED              STATUS
# -------- -------- --------
# 20260220-zzz     2026-02-20 15:00     → Running
# 20260219-aaa     2026-02-19 10:00     ✓ Completed
# 20260218-mmm     2026-02-18 12:00     ✗ Failed

# Expected Exit Code: 0
```

### Scenario 4: Status Visual Indicators
**Expected**: Clear visual distinction between running, completed, and failed sessions

```bash
# Setup: Create one session of each status type
mkdir -p ~/.playbooks/sessions/{20260219-run,20260219-comp,20260219-fail,20260219-pend}

# Running
cat > ~/.playbooks/sessions/20260219-run/session.yaml << 'EOF'
session_id: "20260219-run"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "in_progress"
started_at: "2026-02-19T19:00:00.000Z"
completed_at: ""
current_step: "step-1"
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-run/journal.yaml << 'EOF'
entries: []
EOF

# Completed
cat > ~/.playbooks/sessions/20260219-comp/session.yaml << 'EOF'
session_id: "20260219-comp"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "completed"
started_at: "2026-02-19T18:00:00.000Z"
completed_at: "2026-02-19T18:30:00.000Z"
current_step: ""
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-comp/journal.yaml << 'EOF'
entries: []
EOF

# Failed
cat > ~/.playbooks/sessions/20260219-fail/session.yaml << 'EOF'
session_id: "20260219-fail"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "failed"
started_at: "2026-02-19T17:00:00.000Z"
completed_at: "2026-02-19T17:30:00.000Z"
current_step: "step-2"
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-fail/journal.yaml << 'EOF'
entries: []
EOF

# Pending
cat > ~/.playbooks/sessions/20260219-pend/session.yaml << 'EOF'
session_id: "20260219-pend"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "pending"
started_at: "2026-02-19T16:00:00.000Z"
completed_at: ""
current_step: ""
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-pend/journal.yaml << 'EOF'
entries: []
EOF

# Execute
npx @tcanaud/playbook list

# Expected Output (note: status indicators)
# ID               CREATED              STATUS
# -------- -------- --------
# 20260219-run     2026-02-19 19:00     → Running
# 20260219-comp    2026-02-19 18:00     ✓ Completed
# 20260219-fail    2026-02-19 17:00     ✗ Failed
# 20260219-pend    2026-02-19 16:00     → Pending

# Visual Verification:
# - → used for running/pending (in progress)
# - ✓ used for completed (success)
# - ✗ used for failed (error)
```

### Scenario 5: Chronological Sorting
**Expected**: Sessions sorted by most recent first (descending by timestamp)

```bash
# Setup: Create sessions with specific dates in non-chronological order
mkdir -p ~/.playbooks/sessions/{20260218-aaa,20260220-zzz,20260219-mmm}

for sessionId in 20260218-aaa 20260220-zzz 20260219-mmm; do
  mkdir -p ~/.playbooks/sessions/$sessionId
  date="${sessionId:0:4}-${sessionId:4:2}-${sessionId:6:2}"
  cat > ~/.playbooks/sessions/$sessionId/session.yaml << EOF
session_id: "$sessionId"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "completed"
started_at: "${date}T12:00:00.000Z"
completed_at: "${date}T13:00:00.000Z"
current_step: ""
worktree: ""
EOF
  cat > ~/.playbooks/sessions/$sessionId/journal.yaml << 'EOF'
entries: []
EOF
done

# Execute
npx @tcanaud/playbook list

# Expected Output (most recent first)
# ID               CREATED              STATUS
# -------- -------- --------
# 20260220-zzz     2026-02-20 12:00     ✓ Completed
# 20260219-mmm     2026-02-19 12:00     ✓ Completed
# 20260218-aaa     2026-02-18 12:00     ✓ Completed

# Verification: Sessions are in descending chronological order
```

### Scenario 6: Terminal Width Compliance
**Expected**: Output fits within 80-character terminal width with 5-10 sessions

```bash
# Setup: Create 10 test sessions
for i in {0..9}; do
  sessionId="20260219-$(printf '%03d' $i)"
  mkdir -p ~/.playbooks/sessions/$sessionId
  cat > ~/.playbooks/sessions/$sessionId/session.yaml << EOF
session_id: "$sessionId"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "completed"
started_at: "2026-02-19T$(printf '%02d' $((i+10))):00:00.000Z"
completed_at: "2026-02-19T$(printf '%02d' $((i+11))):00:00.000Z"
current_step: ""
worktree: ""
EOF
  cat > ~/.playbooks/sessions/$sessionId/journal.yaml << 'EOF'
entries: []
EOF
done

# Execute and check line widths
npx @tcanaud/playbook list | awk '{print length, $0}' | sort -rn | head -1

# Expected: Maximum line length <= 80
# Example output: 79 20260219-009     2026-02-19 19:00     ✓ Completed

# Verification:
# - No line exceeds 80 characters
# - No horizontal scrolling required
# - All columns visible without wrapping
```

### Scenario 7: Corrupted Session File Handling
**Expected**: Skips corrupted sessions with warning, continues with readable ones

```bash
# Setup: Create one good session and one with corrupted YAML
mkdir -p ~/.playbooks/sessions/{20260219-good,20260219-bad}

# Good session
cat > ~/.playbooks/sessions/20260219-good/session.yaml << 'EOF'
session_id: "20260219-good"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "completed"
started_at: "2026-02-19T19:00:00.000Z"
completed_at: "2026-02-19T20:00:00.000Z"
current_step: ""
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-good/journal.yaml << 'EOF'
entries: []
EOF

# Corrupted session (bad YAML syntax)
cat > ~/.playbooks/sessions/20260219-bad/session.yaml << 'EOF'
invalid: yaml: [syntax
EOF

# Execute (stderr should show warning)
npx @tcanaud/playbook list 2>&1

# Expected Output
# Warning: Could not read session in ~/.playbooks/sessions/20260219-bad: [error message]
#
# ID               CREATED              STATUS
# -------- -------- --------
# 20260219-good    2026-02-19 19:00     ✓ Completed

# Expected Exit Code: 0 (success, despite corrupted session)
```

### Scenario 8: Timestamp Formatting
**Expected**: Timestamps display in compact format (YYYY-MM-DD HH:MM)

```bash
# Setup: Create session with specific ISO timestamp
mkdir -p ~/.playbooks/sessions/20260219-time
cat > ~/.playbooks/sessions/20260219-time/session.yaml << 'EOF'
session_id: "20260219-time"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "completed"
started_at: "2026-02-19T19:22:45.123Z"
completed_at: "2026-02-19T20:15:30.456Z"
current_step: ""
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-time/journal.yaml << 'EOF'
entries: []
EOF

# Execute
npx @tcanaud/playbook list

# Expected Output
# ID               CREATED              STATUS
# -------- -------- --------
# 20260219-time    2026-02-19 19:22     ✓ Completed

# Verification:
# - Timestamp shows only date and hour:minute (no seconds)
# - Format is YYYY-MM-DD HH:MM
# - Compact format saves terminal space
```

## Acceptance Criteria

- [x] Command displays all sessions (running, completed, failed, pending)
- [x] Clear message when no sessions exist
- [x] Table format with headers: ID, CREATED, STATUS
- [x] Sessions sorted chronologically by creation time (most recent first)
- [x] Status visual indicators present (→, ✓, ✗)
- [x] No color codes used (plain text only)
- [x] Timestamp format compact (YYYY-MM-DD HH:MM)
- [x] Output fits within 80-character terminal width
- [x] Handles corrupted session files gracefully (skip with warning)
- [x] Exit code is 0 for success (including empty case)
- [x] Exit code is 1 for errors
- [x] Human-readable output is clear and scannable

## Notes

- Session ID is shown in full (up to 16 chars)
- Created timestamp shows only date and hour:minute (compact format)
- Status indicator symbols (→, ✓, ✗) are text-based, not color-based
- Sorting uses session ID descending order (works because ID includes YYYYMMDD)
- Corrupted sessions generate warning but don't halt processing
- All sessions types are displayed together (no filtering like status command)
