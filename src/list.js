/**
 * List command handler for displaying all playbook sessions.
 *
 * Discovers all sessions (running and completed) from .playbooks/sessions/
 * and displays them in human-readable format or JSON format.
 * Supports --json flag for JSON output.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { discoverSessions, parseSessions } from "./session.js";
import { formatSessionsTable, formatSessionsJson } from "./format.js";

/**
 * Handles the 'list' command to display all playbook sessions.
 *
 * Discovers all sessions from .playbooks/sessions/ and displays them in
 * either human-readable table format or JSON format based on --json flag.
 *
 * Supports:
 *   npx @tcanaud/playbook list        → human-readable table format
 *   npx @tcanaud/playbook list --json → JSON array format
 *
 * Exit codes:
 *   0 - Success (sessions found or no sessions)
 *   1 - Error reading sessions directory
 *
 * @param {string[]} args - Command line arguments (checks for --json flag)
 */
export async function list(args) {
  try {
    // Check for --json flag
    const useJson = args && args.includes("--json");

    // Construct path to .playbooks/sessions directory
    const playbooksDir = join(homedir(), ".playbooks");
    const sessionDirs = discoverSessions(playbooksDir);

    // Parse all discovered sessions
    const allSessions = parseSessions(sessionDirs);

    // Sort by most recent first (descending order)
    allSessions.sort((a, b) => {
      if (a.id > b.id) return -1;
      if (a.id < b.id) return 1;
      return 0;
    });

    if (useJson) {
      // JSON output
      const jsonOutput = formatSessionsJson(allSessions);
      console.log(jsonOutput);
    } else {
      // Human-readable output
      if (allSessions.length === 0) {
        console.log("No playbook sessions found.");
      } else {
        const table = formatSessionsTable(allSessions);
        console.log(table);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
