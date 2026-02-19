# Manual Testing: Status Command (User Story 1)

**Feature**: `npx @tcanaud/playbook status` command displays all currently running playbook sessions

## Test Scenarios

### Scenario 1: No Running Sessions
**Expected**: Clear message indicating no running sessions

```bash
# Setup: Delete all running sessions (or use fresh directory)
rm -rf ~/.playbooks/sessions

# Execute
npx @tcanaud/playbook status

# Expected Output
# No running playbook sessions found.

# Expected Exit Code: 0
```

### Scenario 2: Single Running Session
**Expected**: Table showing one running session with ID, creation time, and status

```bash
# Setup: Create a test session manually
mkdir -p ~/.playbooks/sessions/20260219-abc
cat > ~/.playbooks/sessions/20260219-abc/session.yaml << 'EOF'
session_id: "20260219-abc"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "in_progress"
started_at: "2026-02-19T19:22:15.000Z"
completed_at: ""
current_step: ""
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-abc/journal.yaml << 'EOF'
entries: []
EOF

# Execute
npx @tcanaud/playbook status

# Expected Output Format
# ID               CREATED              STATUS
# -------- -------- --------
# 20260219-abc     2026-02-19 19:22     Running

# Expected Exit Code: 0
```

### Scenario 3: Multiple Running Sessions
**Expected**: Table showing all running sessions sorted by most recent first

```bash
# Setup: Create multiple test sessions
mkdir -p ~/.playbooks/sessions/{20260219-aaa,20260219-zzz,20260219-mmm}

for dir in ~/.playbooks/sessions/20260219-{aaa,zzz,mmm}; do
  cat > "$dir/session.yaml" << 'EOF'
session_id: "$(basename $dir)"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "in_progress"
started_at: "2026-02-19T19:22:15.000Z"
completed_at: ""
current_step: ""
worktree: ""
EOF
  cat > "$dir/journal.yaml" << 'EOF'
entries: []
EOF
done

# Execute
npx @tcanaud/playbook status

# Expected Output Format (note: sorted by most recent first)
# ID               CREATED              STATUS
# -------- -------- --------
# 20260219-zzz     2026-02-19 19:22     Running
# 20260219-mmm     2026-02-19 19:22     Running
# 20260219-aaa     2026-02-19 19:22     Running

# Expected Exit Code: 0
```

### Scenario 4: Mixed Session Statuses (Only Running Shown)
**Expected**: Only in_progress/running sessions displayed, completed/failed sessions hidden

```bash
# Setup: Create sessions with different statuses
mkdir -p ~/.playbooks/sessions/{20260219-running,20260219-completed,20260219-failed}

# Running session
cat > ~/.playbooks/sessions/20260219-running/session.yaml << 'EOF'
session_id: "20260219-running"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "in_progress"
started_at: "2026-02-19T19:00:00.000Z"
completed_at: ""
current_step: ""
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-running/journal.yaml << 'EOF'
entries: []
EOF

# Completed session
cat > ~/.playbooks/sessions/20260219-completed/session.yaml << 'EOF'
session_id: "20260219-completed"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "completed"
started_at: "2026-02-19T18:00:00.000Z"
completed_at: "2026-02-19T19:00:00.000Z"
current_step: ""
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-completed/journal.yaml << 'EOF'
entries: []
EOF

# Failed session
cat > ~/.playbooks/sessions/20260219-failed/session.yaml << 'EOF'
session_id: "20260219-failed"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "failed"
started_at: "2026-02-19T17:00:00.000Z"
completed_at: "2026-02-19T18:00:00.000Z"
current_step: ""
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-failed/journal.yaml << 'EOF'
entries: []
EOF

# Execute
npx @tcanaud/playbook status

# Expected Output (only running shown)
# ID               CREATED              STATUS
# -------- -------- --------
# 20260219-running 2026-02-19 19:00     Running

# Expected Exit Code: 0
```

### Scenario 5: Terminal Width Compliance
**Expected**: Output fits within 80-character terminal width

```bash
# Setup: Create multiple sessions (5-10)
# Execute in 80-character terminal width
npx @tcanaud/playbook status

# Verification:
# 1. No line exceeds 80 characters
# 2. No horizontal scrolling required
# 3. All columns visible without wrapping

# Expected Exit Code: 0
```

## Acceptance Criteria

- [x] Command executes without errors
- [x] Shows only running/in_progress sessions (filters out completed/failed)
- [x] Clear message when no running sessions exist
- [x] Displays session ID, creation time (formatted as YYYY-MM-DD HH:MM), and status
- [x] Table format is human-readable with clear column headers
- [x] Sessions sorted by most recent first (descending order)
- [x] Output fits within 80-character terminal width
- [x] Exit code is 0 for success (including empty case)
- [x] Exit code is 1 for errors (permission denied, etc.)

## Notes

- Session creation timestamp is shown (from `started_at` field in session.yaml)
- Status is normalized to "Running" display label (regardless of internal value)
- Sorting by session ID works because ID format includes YYYYMMDD prefix
- Table header row with dashes separates headers from data rows
