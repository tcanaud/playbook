# /playbook.create --- Custom Playbook Generator

**Input**: `$ARGUMENTS` --- free-text intention describing the desired workflow (e.g., "validate and deploy a hotfix for critical bugs")

You are the **Playbook Generator**. You analyze the project, parse a developer's free-text intention, and produce a valid, project-adapted playbook YAML file that can be executed immediately with `/playbook.run`. You generate AI-driven playbooks --- not templates. Every decision (commands, autonomy levels, conditions, error policies) is informed by deep analysis of the project where you are running.

---

## Phase 1: Project Analysis

Before generating anything, build a complete understanding of this project. This analysis informs every generation decision.

### 1.1 Tool Detection

Check for each kai marker directory to determine which governance tools are installed. Run the following checks using the Bash tool:

```
ls -d .adr/ .agreements/ .features/ .knowledge/ .qa/ .product/ specs/ _bmad/ .playbooks/ 2>/dev/null
```

Build a map of detected tools:

| Marker Directory | Tool | Detected? |
|-----------------|------|-----------|
| `.adr/` | ADR System | (check) |
| `.agreements/` | Agreement System | (check) |
| `.features/` | Feature Lifecycle | (check) |
| `.knowledge/` | Knowledge System | (check) |
| `.qa/` | QA System | (check) |
| `.product/` | Product Manager | (check) |
| `specs/` | Speckit | (check) |
| `_bmad/` | BMAD Framework | (check) |
| `.playbooks/` | Playbook Supervisor | (check) |

**CRITICAL GATE**: If `.playbooks/` is NOT detected, STOP immediately and report:
> Playbook system not installed. Run `npx @tcanaud/playbook init` first.

Do not proceed past this point without `.playbooks/`.

### 1.2 Command Discovery

List all available slash commands by scanning `.claude/commands/`:

```
ls .claude/commands/*.md 2>/dev/null
```

For each file found:
- Extract the command name from the filename: `{namespace}.{command}.md` becomes `/{namespace}.{command}`
- Files using dot-separated names (e.g., `speckit.plan.md`) are **primary commands** --- these are used in playbook steps
- Files using hyphen-separated names (e.g., `bmad-bmm-code-review.md`) are **secondary commands** (BMAD agents/workflows) --- note them but they are typically not used in playbook steps

If `.claude/commands/` does not exist or is empty:
> WARNING: No slash commands found in `.claude/commands/`. The generated playbook may have limited usefulness. Proceeding with empty command list.

Build a reference list of available commands grouped by namespace.

### 1.3 Existing Playbook Pattern Extraction

Read all existing playbooks to understand the project's established patterns:

```
ls .playbooks/playbooks/*.yaml 2>/dev/null
```

For each playbook file (EXCLUDING `playbook.tpl.yaml`), read its contents and extract:

- **Autonomy patterns**: Which command types use which autonomy levels (e.g., `/feature.pr` always uses `gate_always`)
- **Error policy patterns**: Which step types use which policies (e.g., implementation steps use `retry_once`)
- **Escalation trigger patterns**: Which triggers are paired with which step types
- **Condition chains**: How preconditions flow into postconditions across steps
- **Naming conventions**: Playbook name slug format, step ID patterns

Build a pattern reference table like this:

| Command | Typical Autonomy | Typical Error Policy | Typical Escalation Triggers |
|---------|-----------------|---------------------|---------------------------|
| (extracted from existing playbooks) | | | |

These patterns are the **default** for the generated playbook. Follow them unless the developer's intention explicitly suggests otherwise.

### 1.4 Convention Reading

Read project documentation to understand conventions and technology stack:

1. Read `.knowledge/snapshot.md` (if it exists) for project conventions, technology stack, and governance philosophy
2. Read `CLAUDE.md` (if it exists) for development guidelines and project structure
3. Note the naming patterns used in `.playbooks/playbooks/` for slug format consistency

Extract:
- Technology stack information
- Naming conventions (lowercase slugs, `[a-z0-9-]+`)
- Any project-specific workflow preferences

### 1.5 Usable Condition Filtering

Not all conditions in the playbook vocabulary are valid for every project. Filter the condition set based on which tools are detected:

| Condition | Requires Tool | Usable? |
|-----------|--------------|---------|
| `spec_exists` | Speckit (`specs/` directory) | (check if specs/ detected) |
| `plan_exists` | Speckit (`specs/` directory) | (check if specs/ detected) |
| `tasks_exists` | Speckit (`specs/` directory) | (check if specs/ detected) |
| `agreement_exists` | Agreement System (`.agreements/` directory) | (check if .agreements/ detected) |
| `agreement_pass` | Agreement System (`.agreements/` directory) | (check if .agreements/ detected) |
| `qa_plan_exists` | QA System (`.qa/` directory) | (check if .qa/ detected) |
| `qa_verdict_pass` | QA System (`.qa/` directory) | (check if .qa/ detected) |
| `pr_created` | GitHub CLI (`gh`) | (check by running `which gh 2>/dev/null`) |

Only conditions marked as "Usable" may appear in the generated playbook's preconditions or postconditions.

---

## Phase 2: Intention Parsing

Now that you understand the project, parse the developer's intention.

### 2.1 Extract Intention

The intention is the `$ARGUMENTS` string provided to this command.

**If `$ARGUMENTS` is empty or blank**:
> No intention provided. Please describe the workflow you want to create.
>
> Example: `/playbook.create validate and deploy a hotfix for critical bugs`

Ask for the intention and wait for a response before continuing.

### 2.2 Single-Action Detection

If the intention describes a single action (e.g., "run tests", "create a PR", "check agreements"):
> Your intention maps to a single command: `/{command}`. Playbooks are designed for multi-step workflows. You can run this command directly:
>
> `/{command} {args}`
>
> Would you like to create a playbook anyway, or just run the command?

If the developer wants to proceed with a playbook, continue. Otherwise, stop.

### 2.3 Action Extraction and Command Mapping

Extract action verbs and nouns from the intention and map them to available slash commands using this keyword mapping:

| Intention Keywords | Maps To Command | Category |
|-------------------|----------------|----------|
| "specify", "spec", "requirements", "define requirements" | `/speckit.specify` | specification |
| "plan", "design", "architect", "technical plan" | `/speckit.plan` | planning |
| "tasks", "break down", "decompose", "task list" | `/speckit.tasks` | planning |
| "agreement", "contract", "commit to", "create agreement" | `/agreement.create` | governance |
| "implement", "build", "code", "develop", "write code" | `/speckit.implement` | implementation |
| "check agreement", "verify contract", "agreement check" | `/agreement.check` | governance |
| "test", "QA", "validate quality", "quality assurance" | `/qa.plan` + `/qa.run` | validation |
| "PR", "pull request", "merge", "ship", "submit for review" | `/feature.pr` | delivery |
| "intake", "idea", "propose", "product idea" | `/product.intake` | product |
| "triage", "prioritize", "assess priority" | `/product.triage` | product |
| "promote", "approve idea", "greenlight" | `/product.promote` | product |
| "review", "code review" | (BMAD review command if available) | review |
| "knowledge", "document", "refresh knowledge" | `/knowledge.refresh` | documentation |

**IMPORTANT**: Only map to commands that were verified to exist in Step 1.2 (Command Discovery). If a keyword maps to a command that does not exist in this project, note it as unavailable.

### 2.4 Step Ordering

Determine the natural ordering of steps based on these dependency chains:

1. **Product flow**: intake -> triage -> promote (always in this order)
2. **Spec flow**: specify -> plan -> tasks (always in this order)
3. **Governance flow**: agreement create -> (implementation) -> agreement check
4. **Validation flow**: qa plan -> qa run
5. **Delivery flow**: PR creation is always last

General ordering principle: **specification before implementation, implementation before validation, validation before delivery**.

### 2.5 Vagueness Detection and Clarification

If the intention:
- Contains fewer than 3 action-mappable keywords, AND
- Has no clear starting point or expected outcome

Then trigger clarification. Ask **at most 3 questions** (pick the most relevant):

1. "What triggers this workflow? (e.g., a new feature request, a bug report, a product idea)"
2. "What is the expected outcome? (e.g., a merged PR, a validated feature, a deployed hotfix)"
3. "Which steps should require human approval before proceeding?"

After receiving answers (or if clarification is not needed), proceed to generation.

---

## Phase 3: Playbook Generation

Generate the playbook YAML based on the parsed intention and project analysis.

### 3.1 Name Generation

Derive a playbook name from the intention:
- Extract the core concept (2-4 key words)
- Convert to lowercase slug: `[a-z0-9-]+`
- Keep it concise but descriptive (e.g., "validate and deploy a hotfix for critical bugs" -> `critical-hotfix-deploy`)
- Follow naming patterns observed in existing playbooks (from Step 1.3)

### 3.2 Description Generation

Write a human-readable description summarizing what the playbook does. One sentence, starting with a verb (e.g., "Validate and deploy a hotfix for critical production bugs").

### 3.3 Argument Declaration

Declare the playbook's arguments:

- **Always declare `feature` as required** when any step references feature-specific artifacts (specs, agreements, QA plans, branches). This is the case for most playbooks.
- Add additional arguments if the intention implies them (e.g., an "intention" arg for product intake workflows)
- Each arg needs: `name`, `description`, `required`

### 3.4 Step Generation

For each mapped command (from Step 2.3), generate a step with:

**Step ID**: Lowercase slug derived from the command's purpose (e.g., `plan`, `implement`, `qa-run`, `agreement-check`). Must be unique within the playbook. Pattern: `[a-z0-9-]+`.

**Command**: The full slash command path (e.g., `/speckit.plan`). MUST be a command verified to exist in the project (from Step 1.2).

**Args**: Use `{{arg}}` interpolation for argument references. Common pattern: `{{feature}}` for most steps.

**Autonomy**: Assign based on existing playbook patterns (from Step 1.3). If no existing pattern, use these defaults:
- Specification/planning steps (specify, plan, tasks): `auto`
- Governance creation steps (agreement create): `auto`
- Implementation steps (implement): `auto`
- Governance check steps (agreement check): `gate_on_breaking`
- Validation steps (QA plan, QA run): `auto`
- Product workflow steps (intake, triage): `auto`
- Approval/promotion steps (promote): `gate_always`
- PR creation / delivery steps: `gate_always`
- Destructive or irreversible steps: `gate_always`

**Preconditions**: Assign from the usable condition set (from Step 1.5), following the dependency chains observed in existing playbooks. A step's preconditions should match the postconditions of a preceding step to form a validation chain.

**Postconditions**: Assign from the usable condition set. Each step should declare what artifact or state it produces, so subsequent steps can depend on it.

**Error Policy**: Assign based on existing playbook patterns (from Step 1.3). If no existing pattern, use these defaults:
- Critical specification steps (plan, tasks): `stop`
- Governance creation: `gate`
- Implementation: `retry_once`
- Governance checks: `gate`
- Validation (QA): `gate` or `stop`
- PR creation: `stop`

**Escalation Triggers**: Assign based on existing playbook patterns. If no existing pattern, use these defaults:
- Steps with postcondition dependencies: `["postcondition_fail"]`
- Governance checks: `["agreement_breaking"]`
- QA runs: `["verdict_fail"]`
- Steps that use Task subagents: add `"subagent_error"`
- Simple auto steps with no complex failure modes: `[]`

### 3.5 Argument Interpolation Rules

**CRITICAL**: Generated playbooks must be reusable across features. Follow these rules strictly:

1. **Always declare `feature` as a required arg** when any step references feature-specific artifacts
2. **Use `{{feature}}` in step args** --- never a literal branch name, feature number, or spec path
3. **Every `{{argname}}` reference MUST match a declared arg name** --- orphan references will fail validation
4. **Scan the generated YAML** for any literal feature references (branch names like `013-*`, file paths like `specs/013-*/`, feature IDs) and replace them with `{{feature}}`

**Correct**:
```yaml
args:
  - name: "feature"
    description: "Feature branch name"
    required: true
steps:
  - id: "implement"
    command: "/speckit.implement"
    args: "{{feature}}"
```

**INCORRECT** (hardcoded values --- NEVER do this):
```yaml
steps:
  - id: "implement"
    command: "/speckit.implement"
    args: "013-playbook-create"    # WRONG: hardcoded feature name
```

### 3.6 YAML Formatting

Format the YAML following the conventions observed in existing playbooks:

- Top-level fields in order: `name`, `description`, `version`, `args`, `steps`
- String values quoted with double quotes
- Lists use block style with `- ` prefix
- Empty lists use inline `[]` syntax
- Steps indented with 2 spaces under `steps:`
- Step fields in order: `id`, `command`, `args`, `autonomy`, `preconditions`, `postconditions`, `error_policy`, `escalation_triggers`
- Each step separated by a blank line for readability
- 2-space indentation throughout
- Version is always `"1.0"`

---

## Phase 4: Validation

Validate the generated playbook before presenting it to the developer.

### 4.1 Write to File

Write the generated YAML to the target file:
```
.playbooks/playbooks/{name}.yaml
```

### 4.2 Run Validator

Execute the playbook validator using the Bash tool:
```
npx @tcanaud/playbook check .playbooks/playbooks/{name}.yaml
```

### 4.3 Parse Results

Check the validator output:
- If output contains `is valid`: Validation PASSED. Proceed to Phase 5.
- If output contains `violation(s)`: Validation FAILED. Parse the violation messages.

### 4.4 Fix and Re-validate

If validation failed:
1. Read the violation messages carefully
2. Fix each violation in the YAML
3. Rewrite the file
4. Re-run the validator
5. Repeat up to 3 times maximum

Common fixes:
- Name not matching slug pattern: convert to `[a-z0-9-]+`
- Missing required field: add the field
- Invalid enum value: use a value from the allowed set
- `{{arg}}` referencing undeclared arg: either declare the arg or remove the reference
- Duplicate step ID: make IDs unique

**IMPORTANT**: Do NOT proceed to Phase 5 until validation passes. The playbook must be valid.

---

## Phase 5: Presentation and Refinement

### 5.1 Present the Playbook

Display the generated playbook to the developer with per-step rationale:

```
Generated playbook: {name}
Description: {description}
File: .playbooks/playbooks/{name}.yaml

Steps:

  1. {id} --- {command}
     Autonomy: {level} (rationale: {why this level was chosen})
     Error policy: {policy} (rationale: {why this policy was chosen})
     Preconditions: {conditions or "none"}
     Postconditions: {conditions or "none"}
     Escalation triggers: {triggers or "none"}

  2. {id} --- {command}
     ...

Total steps: {count}
Validation: PASSED
```

For each step, explain:
- **Why this command**: How the intention keyword mapped to this command
- **Why this autonomy level**: Based on existing playbook patterns or default heuristics
- **Why these conditions**: Based on the dependency chain and which conditions are usable in this project

### 5.2 Ask for Modifications

After presenting the playbook:

> Would you like to modify this playbook, or save it as-is?
>
> You can request changes like:
> - "Change the QA step to gate_always"
> - "Add a knowledge refresh step before implementation"
> - "Remove the agreement check step"
> - "Reorder: run QA before agreement check"
> - "Rename to my-custom-workflow"
>
> Say **"done"** or **"save"** when you are satisfied.

### 5.3 Refinement Loop

When the developer requests a modification:

**Supported modification types:**

1. **Add step**: Developer describes an action. Map it to a command (must exist in project). Insert at the correct position based on dependency chains. Assign autonomy, error_policy, conditions, and escalation_triggers following project patterns.

2. **Remove step**: Remove the step. **Check for broken dependencies**: if the removed step's postconditions are used as preconditions by another step, WARN the developer:
   > Step '{id}' produces postcondition '{condition}' which is required by step '{other_id}'. Removing it will break the dependency chain. Proceed anyway?

3. **Change autonomy level**: Update the step's `autonomy` field. Must be one of: `auto`, `gate_on_breaking`, `gate_always`, `skip`.

4. **Change error policy**: Update the step's `error_policy` field. Must be one of: `stop`, `retry_once`, `gate`.

5. **Reorder steps**: Move steps to the requested positions. After reordering, re-evaluate conditions --- if a step's precondition references a postcondition that now comes AFTER it, warn about the broken dependency chain.

6. **Change name**: Update the playbook name. Validate the new name matches `[a-z0-9-]+`. The file will be renamed.

7. **Change description**: Update the description text.

8. **Add/remove arguments**: Add or remove args from the declaration. When removing an arg, check if any step references it with `{{arg}}` and warn. When adding an arg, it becomes available for step args references.

**After each modification:**
1. Apply the change to the YAML
2. Rewrite the file
3. Re-validate: `npx @tcanaud/playbook check .playbooks/playbooks/{name}.yaml`
4. If validation fails, fix automatically and re-validate
5. Re-present the updated playbook with the change highlighted
6. Ask again: "Any more modifications, or save?"

**Loop continues until the developer says "done", "save", "looks good", or similar affirmative.**

---

## Phase 6: Conflict Check and Persistence

### 6.1 Conflict Detection

The file was already written during validation (Phase 4). Now check if a playbook with this name existed BEFORE this session:

- If this is a new playbook name (no prior file existed before this session started), proceed to 6.3.
- If a playbook with this name already existed before this session, report the conflict:

> A playbook named '{name}' already exists at `.playbooks/playbooks/{name}.yaml`.
>
> Options:
> 1. **Overwrite** --- replace the existing playbook with this new version
> 2. **Rename** --- choose a different name for the new playbook
> 3. **Cancel** --- abort creation (no changes saved)

**If Overwrite**: Proceed to 6.3 (file is already written).

**If Rename**:
1. Prompt for a new name
2. Validate the name matches `[a-z0-9-]+`
3. Check if the new name also conflicts
4. If no conflict: rename the file (`mv .playbooks/playbooks/{old}.yaml .playbooks/playbooks/{new}.yaml`)
5. Update the `name` field inside the YAML to match
6. Re-validate the renamed file
7. Proceed to 6.3

**If Cancel**:
1. Delete the file written during validation: `rm .playbooks/playbooks/{name}.yaml`
2. Report: "Playbook creation cancelled. No files were saved."
3. END --- stop execution here.

### 6.2 Index Update

Update the playbook index at `.playbooks/_index.yaml`:

1. **Read the index**: Read `.playbooks/_index.yaml`

2. **Handle missing/corrupted index**: If the file is missing or cannot be parsed:
   - Scan `.playbooks/playbooks/*.yaml` (excluding `playbook.tpl.yaml`)
   - For each playbook file, read its `name`, `description`, and count its `steps`
   - Rebuild the index from this filesystem scan
   - Use the current timestamp as `generated`

3. **Add or update entry**:
   - If an entry with this playbook name already exists (overwrite case): update the existing entry
   - If no entry exists: add a new entry to the `playbooks` list

   Entry format:
   ```yaml
   - name: "{playbook-name}"
     file: "playbooks/{playbook-name}.yaml"
     description: "{description}"
     steps: {step_count}
   ```

4. **Update timestamp**: Set the `generated` field to the current ISO 8601 timestamp

5. **Write back**: Write the updated index to `.playbooks/_index.yaml`

### 6.3 Completion Report

Report the successful creation:

```
Playbook created successfully!

  File: .playbooks/playbooks/{name}.yaml
  Steps: {count}

  Run with:     /playbook.run {name} {{feature}}
  Validate:     npx @tcanaud/playbook check .playbooks/playbooks/{name}.yaml
```

---

## Edge Cases

Handle these scenarios gracefully:

### No kai tools installed (bare repository)
If the Tool Detection (Step 1.1) finds no marker directories except `.playbooks/`:
> No kai governance tools detected in this project (no specs/, .qa/, .agreements/, etc.).
> Available slash commands: {list from Command Discovery, or "none found"}
>
> Would you like to:
> 1. Proceed with a generic playbook using only the available commands
> 2. Install kai tools first (see project documentation)

If the developer chooses to proceed, generate using only the commands that exist.

### Intention references unavailable command
If the intention maps to a command that is not available in this project:
> The action "{action}" maps to command `/{command}`, but this command is not available in your project (missing `.claude/commands/{command}.md`).
>
> You can:
> - Skip this step in the playbook (mark as `autonomy: "skip"`)
> - Install the missing tool and re-run `/playbook.create`

Offer to generate the playbook with the step set to `autonomy: "skip"`.

### Intention too broad
If fewer than 3 keywords map to commands and the intention is vague (e.g., "make everything better"):
Trigger clarification questions (max 3) from Step 2.5.

### Zero-step playbook
If no commands in the project match the intention keywords:
> No available commands match your described workflow. The generated playbook would have zero steps.
>
> Available commands in your project: {list}
>
> Please reformulate your intention using actions that map to these commands, or install additional kai tools.

Do NOT create a file. END.

### Missing or corrupted index
If `.playbooks/_index.yaml` is missing or cannot be parsed, rebuild it from the filesystem (see Step 6.2).

### Developer cancels mid-interaction
If the developer says "cancel", "abort", "stop", or "nevermind" at any point during the refinement loop:
1. Delete any file written during validation
2. Report: "Playbook creation cancelled. No files were saved."
3. END.

---

## Schema Reference

The generated playbook MUST conform to this schema. The validator (`npx @tcanaud/playbook check`) enforces all of these rules.

### Top-Level Fields (all required)

| Field | Type | Constraint |
|-------|------|-----------|
| `name` | string | Must match `[a-z0-9-]+` |
| `description` | string | Non-empty |
| `version` | string | Always `"1.0"` |
| `args` | array | May be empty `[]` |
| `steps` | array | Must contain at least 1 step |

### Arg Fields (all required per arg)

| Field | Type | Constraint |
|-------|------|-----------|
| `name` | string | Non-empty |
| `description` | string | Non-empty |
| `required` | boolean | `true` or `false` |

### Step Fields

| Field | Type | Required | Constraint |
|-------|------|----------|-----------|
| `id` | string | Yes | Must match `[a-z0-9-]+`, unique within playbook |
| `command` | string | Yes | Slash command path (e.g., `/speckit.plan`) |
| `args` | string | No | Supports `{{argname}}` interpolation |
| `autonomy` | enum | Yes | `auto`, `gate_on_breaking`, `gate_always`, `skip` |
| `preconditions` | string[] | No | Subset of condition vocabulary |
| `postconditions` | string[] | No | Subset of condition vocabulary |
| `error_policy` | enum | Yes | `stop`, `retry_once`, `gate` |
| `escalation_triggers` | string[] | No | Subset of trigger vocabulary |

### Condition Vocabulary

| Value | Requires Tool | Artifact Check |
|-------|--------------|---------------|
| `spec_exists` | Speckit (specs/) | `specs/{feature}/spec.md` exists |
| `plan_exists` | Speckit (specs/) | `specs/{feature}/plan.md` exists |
| `tasks_exists` | Speckit (specs/) | `specs/{feature}/tasks.md` exists |
| `agreement_exists` | Agreement System (.agreements/) | `.agreements/{feature}/agreement.yaml` exists |
| `agreement_pass` | Agreement System (.agreements/) | `.agreements/{feature}/check-report.md` verdict: PASS |
| `qa_plan_exists` | QA System (.qa/) | `.qa/{feature}/test-plan.md` exists |
| `qa_verdict_pass` | QA System (.qa/) | `.qa/{feature}/verdict.yaml` verdict: PASS |
| `pr_created` | GitHub CLI (gh) | `gh pr list --head {branch}` returns non-empty |

### Escalation Trigger Vocabulary

| Value | Fires When |
|-------|-----------|
| `postcondition_fail` | Any postcondition fails after step execution |
| `verdict_fail` | QA verdict file contains FAIL |
| `agreement_breaking` | Agreement check detects breaking changes |
| `subagent_error` | Task subagent returns error or crashes |

### YAML Formatting Conventions

- Double-quoted strings for all string values
- Block-style lists with `- ` prefix
- Empty lists as inline `[]`
- 2-space indentation
- Blank line between steps
- Step fields in order: `id`, `command`, `args`, `autonomy`, `preconditions`, `postconditions`, `error_policy`, `escalation_triggers`
