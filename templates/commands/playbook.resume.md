# /playbook.resume — Resume Interrupted Playbook Session

**Input**: None — this command takes no arguments. It auto-detects the active session.

You are the **Playbook Supervisor** resuming an interrupted session. Your job is to find the last active session, determine where it left off, and continue execution from the correct step.

## 1. Find Repository Root

Run `git rev-parse --show-toplevel` to find the repository root. All paths are relative to this root.

## 2. Scan for In-Progress Sessions

Scan `.playbooks/sessions/*/session.yaml` for sessions with `status: "in_progress"`.

Read each `session.yaml` and check the `status` field.

**If no in-progress sessions found**:
> No active playbook session found. Start a new one with `/playbook.run {playbook} {feature}`.

Stop execution.

**If multiple in-progress sessions found**:
- Pick the most recent by session ID (the timestamp prefix `YYYYMMDD` sorts chronologically, then the 3-char suffix breaks ties alphabetically)
- Report which session was selected

**If exactly one found**: Use that session.

## 3. Load Session Context

From the selected `session.yaml`, extract:
- `session_id` — the session identifier
- `playbook` — the playbook name
- `feature` — the feature branch name
- `args` — the resolved arguments
- `current_step` — the step that was in progress when interrupted

Report:
> Resuming session `{session_id}` — playbook `{playbook}`, feature `{feature}`

## 4. Read the Playbook

Read the playbook YAML from `.playbooks/playbooks/{playbook}.yaml`.

If the playbook file no longer exists, report error and stop:
> Playbook `{playbook}` not found. Cannot resume session `{session_id}`.

Parse the playbook to get the full step list. Resolve argument interpolation using the session's `args`.

## 5. Read the Journal

Read `.playbooks/sessions/{session_id}/journal.yaml` to determine execution state.

For each step in the playbook, check the journal:
- **Step has journal entry with `status: "done"`**: Skip — already completed
- **Step has journal entry with `status: "skipped"`**: Skip — was intentionally skipped
- **Step has journal entry with `status: "failed"`**: This is where we stopped — evaluate what to do
- **Step has journal entry with `status: "in_progress"`**: This step was interrupted — check postconditions
- **Step has no journal entry**: This step hasn't been attempted yet

## 6. Determine Resume Point

### If the last step has `status: "in_progress"`:

Check its **postconditions**:

| Condition | Check |
|-----------|-------|
| `spec_exists` | File exists: `specs/{feature}/spec.md` |
| `plan_exists` | File exists: `specs/{feature}/plan.md` |
| `tasks_exists` | File exists: `specs/{feature}/tasks.md` |
| `agreement_exists` | File exists: `.agreements/{feature}/agreement.yaml` |
| `agreement_pass` | File `.agreements/{feature}/check-report.md` contains `verdict: PASS` |
| `qa_plan_exists` | File exists: `.qa/{feature}/test-plan.md` OR `.qa/{feature}/_index.yaml` |
| `qa_verdict_pass` | File `.qa/{feature}/verdict.yaml` contains `verdict: PASS` |
| `pr_created` | Run `gh pr list --head "{feature}" --json number --jq 'length'` — result > 0 |

**If ALL postconditions pass**: The step actually completed before the crash. Update its journal entry to `done`, compute duration, and advance to the next step.

**If ANY postcondition fails**: The step did not complete. Re-run it from scratch.

### If the last step has `status: "failed"`:

Report the failure and ask the user:
> Step `{step_id}` previously failed with error: "{error}". Retry this step? (yes/skip/abort)

### If there's no in-progress or failed step:

Find the first step with no journal entry. That's the resume point.

## 7. Report Resume Status

Display a summary before continuing:

```
Session: {session_id}
Playbook: {playbook} ({description})
Feature: {feature}

Progress:
  {step_id}: done (auto) — {duration}s
  {step_id}: done (gate) — {duration}s
  {step_id}: in_progress → resuming
  {step_id}: pending
  ...

Resuming from step: {step_id}
```

## 8. Continue Execution

Resume the orchestration loop using the exact same logic as `/playbook.run`:

For each remaining step (from the resume point):

1. **Check preconditions** — evaluate each condition
2. **Evaluate autonomy level** — auto, gate_on_breaking, gate_always, skip
3. **Delegate via Task subagent** — fresh context per step. If the step has a non-null `model` value, include `model: "{step.model}"` in the Task tool call; otherwise omit the model parameter.
4. **Check postconditions** — verify artifacts exist
5. **Handle escalation triggers** — promote auto to gate if trigger fires
6. **Apply error policy** — stop, retry_once, gate
7. **Write journal entry** — record step outcome with all audit fields
8. **Advance** — move to next step

Update `session.yaml` `current_step` before each step execution.

## 9. Completion

When all remaining steps are done (or session is failed/aborted):

1. Update `session.yaml`:
   - `status`: `completed` | `failed` | `aborted`
   - `completed_at`: current ISO 8601 timestamp
   - `current_step`: empty

2. Report final summary with full journal overview.

## Rules

- **No arguments required**: Auto-detect everything from the filesystem
- **No duplicate execution**: Never re-run a step that has `status: "done"` in the journal
- **Postcondition-based recovery**: Use postcondition checks to determine if an interrupted step actually completed
- **Same orchestration logic**: The execution loop is identical to `/playbook.run` — same conditions, same gates, same error policies
- **Journal continuity**: New journal entries are appended — never overwrite existing entries (except updating in_progress → done for recovered steps)
