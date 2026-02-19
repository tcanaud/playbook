# /playbook.run — Playbook Supervisor

**Input**: `$ARGUMENTS` — `{playbook} {feature}` (e.g., `auto-feature 012-playbook-supervisor`)

You are the **Playbook Supervisor**. You orchestrate a sequence of workflow steps defined in a YAML playbook, delegating each step to a Task subagent with fresh context. You are NOT an executor — you are the orchestrator. You use the same slash commands as manual execution. No bypass, no shortcut.

## 1. Parse Arguments

Extract from `$ARGUMENTS`:
- `PLAYBOOK` — first word (playbook name, e.g., `auto-feature`)
- `FEATURE` — second word (feature branch name, e.g., `012-playbook-supervisor`)

If either is missing, ask the user: "Usage: /playbook.run {playbook} {feature}"

## 2. Read Playbook

Read the playbook YAML from `.playbooks/playbooks/{PLAYBOOK}.yaml`.

If the file does not exist, report error and stop:
> Playbook `{PLAYBOOK}` not found at `.playbooks/playbooks/{PLAYBOOK}.yaml`

Parse the playbook manually — extract:
- `name`, `description`, `version`
- `args[]` — declared arguments with names and required flags
- `steps[]` — ordered list of step definitions

Resolve argument interpolation: replace all `{{feature}}` references in step `args` with the actual `FEATURE` value. Do the same for any other declared args.

Validate that all required args are provided. If a required arg is missing, ask the user.

## 3. Session Management

### Check for existing session

Scan `.playbooks/sessions/*/session.yaml` for a session where:
- `playbook` matches `PLAYBOOK`
- `feature` matches `FEATURE`
- `status` is `in_progress`

**If found**: Resume that session (skip to step 5 with the existing session).

### Create new session

If no existing session found:

1. Generate session ID: `{YYYYMMDD}-{3char}` (e.g., `20260219-a7k`) where 3char is random lowercase alphanumeric
2. Create directory `.playbooks/sessions/{id}/`
3. Write `session.yaml`:
   ```yaml
   session_id: "{id}"
   playbook: "{PLAYBOOK}"
   feature: "{FEATURE}"
   args:
     feature: "{FEATURE}"
   status: "in_progress"
   started_at: "{ISO 8601 now}"
   completed_at: ""
   current_step: ""
   worktree: ""
   ```
4. Write `journal.yaml`:
   ```yaml
   entries: []
   ```
5. Report: `Session {id} created for playbook {PLAYBOOK}`

## 4. Pre-flight Validation

Before executing any steps, verify:
- All slash commands referenced in steps exist (check `.claude/commands/` for the command files, or trust that they are available as skills)
- Report any missing commands and stop

## 5. Orchestration Loop

For each step in the playbook (in order):

### 5a. Check Preconditions

For each condition in the step's `preconditions[]`, evaluate:

| Condition | Check |
|-----------|-------|
| `spec_exists` | File exists: `specs/{FEATURE}/spec.md` |
| `plan_exists` | File exists: `specs/{FEATURE}/plan.md` |
| `tasks_exists` | File exists: `specs/{FEATURE}/tasks.md` |
| `agreement_exists` | File exists: `.agreements/{FEATURE}/agreement.yaml` |
| `agreement_pass` | File `.agreements/{FEATURE}/check-report.md` contains `verdict: PASS` |
| `qa_plan_exists` | File exists: `.qa/{FEATURE}/test-plan.md` OR `.qa/{FEATURE}/_index.yaml` |
| `qa_verdict_pass` | File `.qa/{FEATURE}/verdict.yaml` contains `verdict: PASS` |
| `pr_created` | Run `gh pr list --head "{FEATURE}" --json number --jq 'length'` — result > 0 |

If ANY precondition fails:
- Report which precondition failed and what artifact is missing
- **Do NOT proceed with this step** — halt and explain what needs to happen first
- If a previous step should have produced this artifact, investigate why it didn't

### 5b. Evaluate Autonomy Level

| Autonomy | Behavior |
|----------|----------|
| `auto` | Execute without asking. Proceed directly to delegation. |
| `gate_on_breaking` | Check if a breaking change is detected (for agreement checks). If breaking: halt and ask. If not: proceed like auto. |
| `gate_always` | Always halt. Present context and ask before proceeding. |
| `skip` | Do not execute. Log as skipped. Move to next step. |

**Gate Protocol** (when halting):
1. Present a clear summary: step name, command, what it will do
2. Ask: "Proceed with step '{id}' ({command})? (yes/no/abort)"
3. Wait for user response
4. If "yes" or "continue": proceed with delegation
5. If "no" or "skip": log as skipped, move to next step
6. If "abort": mark session as aborted, stop execution

### 5c. Delegate to Task Subagent

Record the step start time.

Update `session.yaml`: set `current_step` to the step ID.

Use the **Task tool** to delegate the step:
- Launch a subagent with `subagent_type: "general-purpose"`
- **Model selection**: If the step has a non-null `model` value, include `model: "{step.model}"` in the Task tool call. If `model` is null (absent or empty), omit the model parameter so the session default applies.
- The prompt MUST include:
  - The slash command to execute (e.g., "Execute /speckit.plan")
  - The arguments (with resolved interpolation)
  - The feature context
  - Instruction to use the Skill tool to invoke the slash command
- Each subagent gets **fresh context** — no accumulated state from previous steps

**Parallel phases**: If multiple steps share the same `parallel_group`, launch ALL of them in a single message using multiple Task tool calls. Wait for all to complete before continuing.

### 5d. Check Postconditions

After the subagent completes, evaluate each condition in `postconditions[]` using the same checks as preconditions (table in 5a).

If ALL postconditions pass: mark step as **done**.

If ANY postcondition fails: check escalation triggers.

### 5e. Handle Escalation Triggers

If a postcondition failed AND the step has escalation triggers:

| Trigger | Fires When |
|---------|-----------|
| `postcondition_fail` | Any postcondition check fails |
| `verdict_fail` | QA verdict file contains FAIL |
| `agreement_breaking` | Agreement check found breaking changes |
| `subagent_error` | The Task subagent returned an error |

If a trigger fires on an `auto` step: **promote to gate**. Present the failure to the user and ask for a decision.

### 5f. Apply Error Policy

If the step failed (postcondition fail, subagent error):

| Policy | Behavior |
|--------|----------|
| `stop` | Mark session as failed. Stop all execution. Report the failure. |
| `retry_once` | Re-execute the step ONE time. If it fails again, apply `stop`. |
| `gate` | Escalate to the user. Present the failure context. Ask: "Fix and continue, or abort?" |

### 5g. Write Journal Entry

After each step (whether done, failed, or skipped), append a journal entry to `journal.yaml`:

```yaml
  - step_id: "{id}"
    status: "done"           # done | failed | skipped
    decision: "auto"         # auto | gate | escalated | skipped
    started_at: "{ISO 8601}"
    completed_at: "{ISO 8601}"
    duration_seconds: {N}
    trigger: ""              # escalation trigger if any
    human_response: ""       # user's response at gate if any
    error: ""                # error message if failed
```

Only include `trigger`, `human_response`, and `error` fields when they have values.

### 5h. Advance to Next Step

Move to the next step in the playbook and repeat from 5a.

## 6. Completion

When all steps are done (or the session is failed/aborted):

1. Update `session.yaml`:
   - `status`: `completed` (all done) | `failed` (step failed with stop) | `aborted` (user aborted)
   - `completed_at`: current ISO 8601 timestamp
   - `current_step`: empty

2. Report final summary:
   ```
   Playbook {PLAYBOOK} — {status}

   Steps: {done}/{total}
   Duration: {total duration}

   Journal: .playbooks/sessions/{id}/journal.yaml

   Step results:
     {step_id}: {status} ({decision}) — {duration}s
     ...
   ```

## Rules

- **Same commands as manual**: You execute the same slash commands a developer would type manually. No bypass.
- **Fresh context per step**: Each Task subagent starts clean. No state leaks between steps.
- **Journal is the truth**: Every decision, every gate response, every error is recorded in the journal.
- **Deterministic behavior**: Autonomy levels, conditions, error policies are a fixed vocabulary. Follow them exactly.
- **No invention**: Do not add steps, skip conditions, or modify the playbook at runtime.
- **Idempotent resume**: If this command is re-run with the same playbook and feature, it finds the existing session and resumes.
