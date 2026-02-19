# Manual Testing: List Command with JSON Output (User Story 2)

**Feature**: `npx @tcanaud/playbook list --json` command returns all sessions in valid JSON format

## Test Scenarios

### Scenario 1: No Sessions Exist
**Expected**: Empty JSON array

```bash
# Setup: Delete all sessions
rm -rf ~/.playbooks/sessions

# Execute
npx @tcanaud/playbook list --json

# Expected Output
# []

# Expected Exit Code: 0
# Expected: Valid JSON that parses without errors
```

### Scenario 2: Single Session in JSON
**Expected**: JSON array with one session object containing id, createdAt, status

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
npx @tcanaud/playbook list --json

# Expected Output Format
# [
#   {
#     "id": "20260219-abc",
#     "createdAt": "2026-02-19T19:22:15.000Z",
#     "status": "Completed"
#   }
# ]

# Expected Exit Code: 0
# Validation: JSON is valid and contains required fields
```

### Scenario 3: Multiple Sessions in JSON
**Expected**: JSON array with all sessions, sorted by most recent first

```bash
# Setup: Create multiple sessions with different dates
mkdir -p ~/.playbooks/sessions/{20260219-aaa,20260220-zzz,20260218-mmm}

for dir in ~/.playbooks/sessions/20260219-aaa; do
  cat > "$dir/session.yaml" << 'EOF'
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
  cat > "$dir/journal.yaml" << 'EOF'
entries: []
EOF
done

for dir in ~/.playbooks/sessions/20260220-zzz; do
  cat > "$dir/session.yaml" << 'EOF'
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
  cat > "$dir/journal.yaml" << 'EOF'
entries: []
EOF
done

for dir in ~/.playbooks/sessions/20260218-mmm; do
  cat > "$dir/session.yaml" << 'EOF'
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
  cat > "$dir/journal.yaml" << 'EOF'
entries: []
EOF
done

# Execute
npx @tcanaud/playbook list --json

# Expected Output (note: sorted by most recent first)
# [
#   {
#     "id": "20260220-zzz",
#     "createdAt": "2026-02-20T15:00:00.000Z",
#     "status": "Running"
#   },
#   {
#     "id": "20260219-aaa",
#     "createdAt": "2026-02-19T10:00:00.000Z",
#     "status": "Completed"
#   },
#   {
#     "id": "20260218-mmm",
#     "createdAt": "2026-02-18T12:00:00.000Z",
#     "status": "Failed"
#   }
# ]

# Expected Exit Code: 0
# Validation: Entries are sorted by session ID descending (most recent first)
```

### Scenario 4: JSON Schema Validation
**Expected**: Output can be parsed as valid JSON and contains expected fields

```bash
# Setup: Create test session
mkdir -p ~/.playbooks/sessions/20260219-test
cat > ~/.playbooks/sessions/20260219-test/session.yaml << 'EOF'
session_id: "20260219-test"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "running"
started_at: "2026-02-19T19:22:15.000Z"
completed_at: ""
current_step: "step-1"
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-test/journal.yaml << 'EOF'
entries: []
EOF

# Execute and validate with jq
npx @tcanaud/playbook list --json | jq '.[0] | keys'

# Expected Output
# [
#   "createdAt",
#   "id",
#   "status"
# ]

# This confirms all required fields are present
```

### Scenario 5: JSON Output Consistency
**Expected**: Multiple runs produce identical JSON output

```bash
# Setup: Create test session
mkdir -p ~/.playbooks/sessions/20260219-consistent
cat > ~/.playbooks/sessions/20260219-consistent/session.yaml << 'EOF'
session_id: "20260219-consistent"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "completed"
started_at: "2026-02-19T19:22:15.000Z"
completed_at: "2026-02-19T20:22:15.000Z"
current_step: ""
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-consistent/journal.yaml << 'EOF'
entries: []
EOF

# Execute twice and compare
npx @tcanaud/playbook list --json > output1.json
sleep 1
npx @tcanaud/playbook list --json > output2.json
diff output1.json output2.json

# Expected: No differences (outputs are identical)
# Exit code: 0 (no differences)
```

### Scenario 6: Status Field Normalization
**Expected**: Internal status values are normalized to display labels

```bash
# Setup: Create sessions with different status values
mkdir -p ~/.playbooks/sessions/{20260219-inprog,20260219-pend}

cat > ~/.playbooks/sessions/20260219-inprog/session.yaml << 'EOF'
session_id: "20260219-inprog"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "in_progress"
started_at: "2026-02-19T19:00:00.000Z"
completed_at: ""
current_step: "step-1"
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-inprog/journal.yaml << 'EOF'
entries: []
EOF

cat > ~/.playbooks/sessions/20260219-pend/session.yaml << 'EOF'
session_id: "20260219-pend"
playbook: "test-playbook"
feature: "test-feature"
args: {}
status: "pending"
started_at: "2026-02-19T18:00:00.000Z"
completed_at: ""
current_step: ""
worktree: ""
EOF
cat > ~/.playbooks/sessions/20260219-pend/journal.yaml << 'EOF'
entries: []
EOF

# Execute
npx @tcanaud/playbook list --json | jq '.[] | .status'

# Expected Output
# "Running"
# "Pending"

# This confirms status values are normalized to display labels
```

## Acceptance Criteria

- [x] Command accepts `--json` flag
- [x] Returns valid JSON array format
- [x] JSON is properly formatted (indented)
- [x] Each session object contains: id, createdAt, status
- [x] createdAt is in ISO 8601 format
- [x] Status values are normalized (Running, Completed, Failed, Pending)
- [x] Sessions are sorted by most recent first (descending by session ID)
- [x] Empty sessions returns `[]`
- [x] No sessions found returns `[]` (not error message)
- [x] Exit code is 0 for success
- [x] Exit code is 1 for errors
- [x] Output is consistent across multiple runs
- [x] JSON output can be parsed by jq and other JSON parsers

## Notes

- JSON output includes all sessions (running, completed, failed, pending)
- Status field in JSON uses normalized display labels (not raw internal values)
- Sorting is by session ID in descending order (most recent first)
- No additional fields beyond id, createdAt, status in JSON output
- JSON is pretty-printed with 2-space indentation for readability
- No trailing comma in JSON arrays
