#!/usr/bin/env node

import { argv, exit } from "node:process";

const command = argv[2];
const args = argv.slice(3);

// Global error handler for unhandled rejections from async commands
process.on("unhandledRejection", (reason) => {
  console.error(`Error: ${reason?.message || reason}`);
  exit(1);
});

const HELP = `
playbook — YAML-driven orchestration for kai feature workflows.

Usage:
  npx @tcanaud/playbook init       Scaffold .playbooks/ directory and install slash commands
  npx @tcanaud/playbook update     Refresh slash commands and built-in playbooks
  npx @tcanaud/playbook start      Create a worktree session for parallel execution
  npx @tcanaud/playbook check      Validate a playbook YAML file against the schema
  npx @tcanaud/playbook status     Display all currently running playbook sessions
  npx @tcanaud/playbook list       List all playbook sessions (running and completed)
  npx @tcanaud/playbook help       Show this help message

Commands:
  init [--yes]                Skip confirmation prompts
  update                     Refresh commands without touching sessions or custom playbooks
  start {playbook} {feature} Create git worktree + session for parallel playbook execution
  check {file}               Validate playbook YAML against schema
  status                     Display all currently running playbook sessions
  list [--json]              List all playbook sessions (use --json for machine-readable format)

Claude Code commands (after init):
  /playbook.run {playbook} {feature}   Launch supervisor to orchestrate playbook steps
  /playbook.resume                     Auto-detect and resume an interrupted session
`;

switch (command) {
  case "init": {
    const { install } = await import("../src/installer.js");
    await install(args);
    break;
  }
  case "update": {
    const { update } = await import("../src/updater.js");
    await update(args);
    break;
  }
  case "start": {
    const { start } = await import("../src/worktree.js");
    await start(args);
    break;
  }
  case "check": {
    const { check } = await import("../src/validator.js");
    await check(args);
    break;
  }
  case "status": {
    const { status } = await import("../src/status.js");
    await status(args);
    break;
  }
  case "list": {
    const { list } = await import("../src/list.js");
    await list(args);
    break;
  }
  case "help":
  case "--help":
  case "-h":
  case undefined:
    console.log(HELP);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.log(HELP);
    exit(1);
}
