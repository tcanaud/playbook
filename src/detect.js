import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";

// ── Directory detection ─────────────────────────────────

/**
 * Checks if `.playbooks/` exists relative to cwd.
 * @param {string} [cwd] - Directory to check from. Defaults to process.cwd().
 * @returns {string|null} Absolute path to `.playbooks/` if found, null otherwise.
 */
export function detectPlaybooksDir(cwd = process.cwd()) {
  const dir = resolve(cwd, ".playbooks");
  return existsSync(dir) ? dir : null;
}

/**
 * Checks if `.claude/commands/` exists relative to cwd.
 * @param {string} [cwd] - Directory to check from. Defaults to process.cwd().
 * @returns {string|null} Absolute path to `.claude/commands/` if found, null otherwise.
 */
export function detectClaudeCommands(cwd = process.cwd()) {
  const dir = resolve(cwd, join(".claude", "commands"));
  return existsSync(dir) ? dir : null;
}

// ── Git state ───────────────────────────────────────────

/**
 * Returns the absolute path of the git repository root.
 * @returns {string} Trimmed output of `git rev-parse --show-toplevel`.
 * @throws {Error} If not in a git repository or git is unavailable.
 */
export function getRepoRoot() {
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    throw new Error(
      `Failed to determine git repository root: ${err.message ?? String(err)}`
    );
  }
}

/**
 * Determines whether the current directory is a git worktree (not the main working tree).
 *
 * Compares `git rev-parse --show-toplevel` with `git rev-parse --git-common-dir`.
 * In the main working tree, `--git-common-dir` resolves to `{toplevel}/.git`.
 * In a linked worktree, it resolves to the common `.git` directory of the main tree.
 *
 * @returns {boolean} True if current directory is a linked worktree, false otherwise.
 * @throws {Error} If not in a git repository or git is unavailable.
 */
export function isWorktree() {
  try {
    const toplevel = execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    const gitCommonDir = execSync("git rev-parse --git-common-dir", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    // In the main working tree, git-common-dir is "{toplevel}/.git" (or ".git" relative).
    // Resolve both to absolute paths for a reliable comparison.
    const expectedMainGitDir = join(toplevel, ".git");
    const resolvedCommonDir = resolve(toplevel, gitCommonDir);

    return resolvedCommonDir !== expectedMainGitDir;
  } catch (err) {
    throw new Error(
      `Failed to determine worktree status: ${err.message ?? String(err)}`
    );
  }
}

/**
 * Returns the name of the current git branch.
 * @returns {string} Current branch name (trimmed).
 * @throws {Error} If not in a git repository, in detached HEAD state, or git is unavailable.
 */
export function getCurrentBranch() {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    throw new Error(
      `Failed to determine current branch: ${err.message ?? String(err)}`
    );
  }
}

/**
 * Returns true if the working tree has no uncommitted changes (clean state).
 * Equivalent to checking that `git status --porcelain` produces no output.
 * @returns {boolean} True if working tree is clean, false if there are uncommitted changes.
 * @throws {Error} If not in a git repository or git is unavailable.
 */
export function isCleanWorkingTree() {
  try {
    const output = execSync("git status --porcelain", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output.trim() === "";
  } catch (err) {
    throw new Error(
      `Failed to check working tree status: ${err.message ?? String(err)}`
    );
  }
}
