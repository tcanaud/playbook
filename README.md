# @tcanaud/playbook

YAML-driven orchestration for kai feature workflows — autonomous playbook execution with crash recovery, gates, and git-tracked audit journals.

## Installation

```bash
npx @tcanaud/playbook init
```

This creates:
- `.playbooks/` directory with built-in playbooks and template
- `.claude/commands/playbook.run.md`, `playbook.resume.md`, and `playbook.create.md` slash commands

## CLI Commands

| Command | Description |
|---------|-------------|
| `npx @tcanaud/playbook init [--yes]` | Scaffold `.playbooks/` and install slash commands |
| `npx @tcanaud/playbook update` | Refresh commands and built-in playbooks |
| `npx @tcanaud/playbook start {playbook} {feature}` | Create worktree session for parallel execution |
| `npx @tcanaud/playbook check {file}` | Validate playbook YAML against schema |
| `npx @tcanaud/playbook help` | Show usage |

## Claude Code Commands

After installation, use these in the Claude Code TUI:

| Command | Description |
|---------|-------------|
| `/playbook.run {playbook} {feature}` | Launch supervisor to orchestrate playbook steps |
| `/playbook.resume` | Auto-detect and resume an interrupted session |
| `/playbook.create {intention}` | Generate a custom playbook from a free-text intention |

## Built-in Playbooks

| Playbook | Steps | Description |
|----------|-------|-------------|
| `auto-feature` | 8 | plan → tasks → agreement → implement → agreement check → QA plan → QA run → PR |
| `auto-validate` | 2 | QA plan → QA run |

## Custom Playbooks

### Generate with `/playbook.create`

The fastest way to create a custom playbook is to describe your workflow in plain language:

```
/playbook.create validate and deploy a hotfix for critical bugs
```

The system will:
1. Analyze your project (installed tools, available commands, existing playbook patterns)
2. Map your intention to a sequence of slash commands
3. Generate a valid playbook YAML file
4. Present it for review with per-step rationale
5. Accept modifications in an interactive refinement loop
6. Write the final playbook to `.playbooks/playbooks/{name}.yaml` and update the index

If a playbook with the derived name already exists, the system offers to overwrite, rename, or cancel.

### Create manually from template

```bash
cp .playbooks/playbooks/playbook.tpl.yaml .playbooks/playbooks/my-workflow.yaml
# Edit the file, then validate:
npx @tcanaud/playbook check .playbooks/playbooks/my-workflow.yaml
```

## Parallel Execution

Run two features simultaneously in separate worktrees:

```bash
npx @tcanaud/playbook start auto-feature 013-another-feature
# Follow the printed instructions
```

## Session Files

After a run, session files are in `.playbooks/sessions/{id}/`:

- `session.yaml` — manifest (playbook, feature, status, timestamps)
- `journal.yaml` — step-by-step execution log (status, decision type, duration, human responses)

These files are git-tracked and appear in PR diffs for auditability.

## License

MIT
