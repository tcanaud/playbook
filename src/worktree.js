/**
 * Worktree management for playbook supervisor.
 *
 * Implements the `start` CLI command: creates a git worktree with a new
 * session for parallel playbook execution.
 */

import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";
import { cwd, exit } from "node:process";

import { isCleanWorkingTree, getCurrentBranch } from "./detect.js";
import { generateSessionId, createSession } from "./session.js";

const USAGE = `
Usage:
  npx @tcanaud/playbook start {playbook} {feature}

Arguments:
  playbook   Name of the playbook (without .yaml extension)
  feature    Feature branch name for this session

Example:
  npx @tcanaud/playbook start feature-lifecycle my-feature-branch
`;

/**
 * Creates a git worktree and a new session for parallel playbook execution.
 *
 * @param {string[]} args - CLI arguments: [playbookName, featureBranchName]
 */
export async function start(args) {
  const playbook = args[0];
  const feature = args[1];

  // 1. Validate arguments.
  if (!playbook || !feature) {
    console.error("Error: Missing required arguments.");
    console.error(USAGE);
    exit(1);
  }

  // 2. Verify the working tree is clean.
  let clean;
  try {
    clean = isCleanWorkingTree();
  } catch (err) {
    console.error(`Error: Could not check working tree status: ${err.message}`);
    exit(1);
  }

  if (!clean) {
    console.error(
      "Error: Working tree is dirty. Commit or stash changes first."
    );
    exit(1);
  }

  // 3. Verify the playbook file exists.
  const playbookPath = resolve(
    cwd(),
    join(".playbooks", "playbooks", `${playbook}.yaml`)
  );

  if (!existsSync(playbookPath)) {
    console.error(
      `Error: Playbook '${playbook}' not found at .playbooks/playbooks/${playbook}.yaml`
    );
    exit(1);
  }

  // 4. Get the current branch.
  let currentBranch;
  try {
    currentBranch = getCurrentBranch();
  } catch (err) {
    console.error(`Error: Could not determine current branch: ${err.message}`);
    exit(1);
  }

  // 5. Generate a session ID.
  const id = generateSessionId();

  // 6. Create the session manifest and journal.
  const sessionsDir = resolve(cwd(), ".playbooks", "sessions");
  const worktreePath = `../kai-session-${id}`;

  try {
    createSession(sessionsDir, {
      playbookName: playbook,
      feature,
      args: { feature },
      worktree: worktreePath,
    });
  } catch (err) {
    console.error(`Error: Could not create session: ${err.message}`);
    exit(1);
  }

  // 7. Create the git worktree.
  try {
    execSync(`git worktree add ${worktreePath} ${currentBranch}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    const detail = err.stderr ? err.stderr.trim() : (err.message ?? String(err));
    console.error(`Error: Failed to create git worktree: ${detail}`);
    exit(2);
  }

  // 8. Print success message.
  console.log(`\u2713 Session ${id} created`);
  console.log(`\u2713 Worktree created at ${worktreePath}`);
  console.log("");
  console.log("Next steps:");
  console.log(`  cd ${worktreePath} && claude`);
  console.log(`  Then type: /playbook.run ${playbook} ${feature}`);
}
