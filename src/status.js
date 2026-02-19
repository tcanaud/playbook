/**
 * Status command handler for displaying running playbook sessions.
 *
 * Discovers all running sessions from .playbooks/sessions/ and displays them
 * in a human-readable format with session ID, creation time, and status.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { discoverSessions, parseSessions } from "./session.js";
import { formatSessionsTable } from "./format.js";
import { SESSION_STATUS } from "./constants.js";

/**
 * Handles the 'status' command to display currently running playbook sessions.
 *
 * Discovers all sessions from .playbooks/sessions/, filters to only those
 * with status='running' or 'in_progress', and displays them in a human-readable
 * table format with session ID, creation time, and status.
 *
 * Exit codes:
 *   0 - Success (sessions found or no sessions)
 *   1 - Error reading sessions directory
 *
 * @param {string[]} args - Command line arguments (currently unused)
 */
export async function status(args) {
  try {
    // Construct path to .playbooks/sessions directory
    const playbooksDir = join(homedir(), ".playbooks");
    const sessionDirs = discoverSessions(playbooksDir);

    // Parse all discovered sessions
    const allSessions = parseSessions(sessionDirs);

    // Filter to only running/in_progress sessions
    const runningSessions = allSessions.filter(
      (session) =>
        session.status === SESSION_STATUS.RUNNING || session.status === SESSION_STATUS.IN_PROGRESS
    );

    if (runningSessions.length === 0) {
      console.log("No running playbook sessions found.");
      process.exit(0);
    }

    // Format and display running sessions
    const table = formatSessionsTable(runningSessions);
    console.log(table);
    process.exit(0);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
