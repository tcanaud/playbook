/**
 * Session management for playbook supervisor.
 *
 * Handles session ID generation, session manifest and journal I/O.
 * All YAML is written manually — zero runtime dependencies.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Session ID
// ---------------------------------------------------------------------------

/**
 * Generates a session ID in the format `{YYYYMMDD}-{3char}`.
 * The 3-char suffix is random lowercase alphanumeric (a-z0-9).
 *
 * @returns {string} e.g. "20260219-a7k"
 */
export function generateSessionId() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const date = `${yyyy}${mm}${dd}`;

  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 3; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }

  return `${date}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------------

/**
 * Creates a new session directory with session.yaml and journal.yaml.
 * Retries up to 3 times on session ID collision (directory already exists).
 *
 * @param {string} sessionsDir - Absolute path to the sessions directory.
 * @param {{ playbookName: string, feature: string, args: Record<string, string>, worktree?: string }} options
 * @returns {string} The generated session ID.
 * @throws {Error} If a unique session ID cannot be generated after 3 attempts.
 */
export function createSession(sessionsDir, { playbookName, feature, args, worktree }) {
  const MAX_RETRIES = 3;

  let sessionId;
  let sessionDir;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    sessionId = generateSessionId();
    sessionDir = join(sessionsDir, sessionId);
    if (!existsSync(sessionDir)) {
      break;
    }
    if (attempt === MAX_RETRIES - 1) {
      throw new Error(
        `Failed to generate a unique session ID after ${MAX_RETRIES} attempts.`
      );
    }
    sessionId = null;
    sessionDir = null;
  }

  mkdirSync(sessionDir, { recursive: true });

  const startedAt = new Date().toISOString();

  const sessionYaml = serializeSession({
    session_id: sessionId,
    playbook: playbookName,
    feature,
    args: args ?? {},
    status: "pending",
    started_at: startedAt,
    completed_at: "",
    current_step: "",
    worktree: worktree ?? "",
  });

  writeFileSync(join(sessionDir, "session.yaml"), sessionYaml, "utf8");
  writeFileSync(join(sessionDir, "journal.yaml"), "entries: []\n", "utf8");

  return sessionId;
}

// ---------------------------------------------------------------------------
// Session read / update
// ---------------------------------------------------------------------------

/**
 * Reads and parses session.yaml from a session directory.
 * Uses simple line-by-line regex parsing — no YAML library.
 *
 * @param {string} sessionDir - Absolute path to the session directory.
 * @returns {{ session_id: string, playbook: string, feature: string, args: Record<string, string>, status: string, started_at: string, completed_at: string, current_step: string, worktree: string }}
 */
export function readSession(sessionDir) {
  const content = readFileSync(join(sessionDir, "session.yaml"), "utf8");
  return parseSession(content);
}

/**
 * Updates fields in session.yaml by merging provided fields into the existing manifest.
 * Only fields explicitly passed are updated.
 *
 * @param {string} sessionDir - Absolute path to the session directory.
 * @param {Partial<{ session_id: string, playbook: string, feature: string, args: Record<string, string>, status: string, started_at: string, completed_at: string, current_step: string, worktree: string }>} fields
 */
export function updateSession(sessionDir, fields) {
  const current = readSession(sessionDir);
  const merged = { ...current, ...fields };
  const yaml = serializeSession(merged);
  writeFileSync(join(sessionDir, "session.yaml"), yaml, "utf8");
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

/**
 * Appends a new entry to journal.yaml in the session directory.
 * Reads the existing journal, appends, then rewrites the file.
 *
 * Entry fields:
 *   - step_id (required): string
 *   - status (required): "done" | "failed" | "skipped" | "in_progress"
 *   - decision (required): "auto" | "gate" | "escalated" | "skipped"
 *   - started_at (required): ISO 8601
 *   - completed_at (optional): ISO 8601
 *   - duration_seconds (optional): number, computed from timestamps if absent
 *   - trigger (optional): string — escalation trigger that fired
 *   - human_response (optional): string — developer's response at gate
 *   - error (optional): string — error message
 *
 * Optional fields are omitted from YAML when undefined.
 *
 * @param {string} sessionDir
 * @param {{ step_id: string, status: string, decision: string, started_at: string, completed_at?: string, duration_seconds?: number, trigger?: string, human_response?: string, error?: string }} entry
 */
export function appendJournalEntry(sessionDir, entry) {
  const journal = readJournal(sessionDir);

  // Compute duration_seconds from timestamps if not provided but both timestamps exist.
  let duration = entry.duration_seconds;
  if (duration === undefined && entry.started_at && entry.completed_at) {
    const start = Date.parse(entry.started_at);
    const end = Date.parse(entry.completed_at);
    if (!isNaN(start) && !isNaN(end)) {
      duration = Math.round((end - start) / 1000);
    }
  }

  const normalized = {
    step_id: entry.step_id,
    status: entry.status,
    decision: entry.decision,
    started_at: entry.started_at,
    ...(entry.completed_at !== undefined ? { completed_at: entry.completed_at } : {}),
    ...(duration !== undefined ? { duration_seconds: duration } : {}),
    ...(entry.trigger !== undefined ? { trigger: entry.trigger } : {}),
    ...(entry.human_response !== undefined ? { human_response: entry.human_response } : {}),
    ...(entry.error !== undefined ? { error: entry.error } : {}),
  };

  journal.entries.push(normalized);

  const yaml = serializeJournal(journal);
  writeFileSync(join(sessionDir, "journal.yaml"), yaml, "utf8");
}

/**
 * Reads and parses journal.yaml from a session directory.
 *
 * @param {string} sessionDir
 * @returns {{ entries: Array<object> }}
 */
export function readJournal(sessionDir) {
  const content = readFileSync(join(sessionDir, "journal.yaml"), "utf8");
  return parseJournal(content);
}

// ---------------------------------------------------------------------------
// Session discovery
// ---------------------------------------------------------------------------

/**
 * Discovers all sessions in {basePath}/sessions/ directory.
 * Returns array of session directory paths sorted by most recent first.
 *
 * @param {string} basePath - Absolute path to the .playbooks/ directory or sessions directory.
 * @returns {Array<string>} Array of absolute paths to session directories.
 */
export function discoverSessions(basePath) {
  // Handle both .playbooks/ and .playbooks/sessions/ paths
  const sessionsDir = basePath.endsWith("sessions") ? basePath : join(basePath, "sessions");

  if (!existsSync(sessionsDir)) {
    return [];
  }

  let entries;
  try {
    entries = readdirSync(sessionsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const sessionDirs = entries
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => join(sessionsDir, dirent.name))
    .sort()
    .reverse(); // Most recent first (descending order)

  return sessionDirs;
}

/**
 * Parses session directories into session objects.
 * Reads session.yaml from each directory and extracts metadata.
 * Skips unreadable sessions with warnings.
 *
 * @param {Array<string>} sessionDirs - Array of absolute paths to session directories.
 * @returns {Array<{ id: string, createdAt: string, status: string, sessionDir: string }>}
 */
export function parseSessions(sessionDirs) {
  const sessions = [];

  for (const sessionDir of sessionDirs) {
    try {
      const manifest = readSession(sessionDir);
      const sessionId = manifest.session_id || null;

      if (!sessionId) {
        console.warn(`Warning: Session in ${sessionDir} has no session_id, skipping.`);
        continue;
      }

      sessions.push({
        id: sessionId,
        createdAt: manifest.started_at,
        status: manifest.status,
        sessionDir,
      });
    } catch (error) {
      console.warn(`Warning: Could not read session in ${sessionDir}: ${error.message}`);
    }
  }

  return sessions;
}

/**
 * Scans {playbooksDir}/sessions/ for sessions with status "in_progress".
 * Returns results sorted by most recent first (by session ID timestamp prefix).
 *
 * @param {string} playbooksDir - Absolute path to the .playbooks/ directory.
 * @returns {Array<{ sessionId: string, sessionDir: string, manifest: object }>}
 */
export function findInProgressSessions(playbooksDir) {
  const sessionsDir = join(playbooksDir, "sessions");

  if (!existsSync(sessionsDir)) {
    return [];
  }

  let entries;
  try {
    entries = readdirSync(sessionsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];

  for (const dirent of entries) {
    if (!dirent.isDirectory()) continue;

    const sessionDir = join(sessionsDir, dirent.name);
    const manifestPath = join(sessionDir, "session.yaml");

    if (!existsSync(manifestPath)) continue;

    let manifest;
    try {
      manifest = readSession(sessionDir);
    } catch {
      continue;
    }

    if (manifest.status === "in_progress") {
      results.push({
        sessionId: dirent.name,
        sessionDir,
        manifest,
      });
    }
  }

  // Sort by session ID descending (most recent first).
  // Session IDs are "{YYYYMMDD}-{3char}" — lexicographic sort works correctly.
  results.sort((a, b) => {
    if (a.sessionId > b.sessionId) return -1;
    if (a.sessionId < b.sessionId) return 1;
    return 0;
  });

  return results;
}

// ---------------------------------------------------------------------------
// Internal: YAML serialization
// ---------------------------------------------------------------------------

/**
 * Serializes a session manifest object to YAML string.
 *
 * @param {{ session_id: string, playbook: string, feature: string, args: Record<string, string>, status: string, started_at: string, completed_at: string, current_step: string, worktree: string }} session
 * @returns {string}
 */
function serializeSession(session) {
  const lines = [];

  lines.push(`session_id: "${escape(session.session_id)}"`);
  lines.push(`playbook: "${escape(session.playbook)}"`);
  lines.push(`feature: "${escape(session.feature)}"`);

  const argsObj = session.args ?? {};
  const argKeys = Object.keys(argsObj);
  if (argKeys.length === 0) {
    lines.push("args: {}");
  } else {
    lines.push("args:");
    for (const key of argKeys) {
      lines.push(`  ${key}: "${escape(String(argsObj[key]))}"`);
    }
  }

  lines.push(`status: "${escape(session.status)}"`);
  lines.push(`started_at: "${escape(session.started_at)}"`);
  lines.push(`completed_at: "${escape(session.completed_at ?? "")}"`);
  lines.push(`current_step: "${escape(session.current_step ?? "")}"`);
  lines.push(`worktree: "${escape(session.worktree ?? "")}"`);

  return lines.join("\n") + "\n";
}

/**
 * Serializes a journal object to YAML string.
 *
 * @param {{ entries: Array<object> }} journal
 * @returns {string}
 */
function serializeJournal(journal) {
  if (journal.entries.length === 0) {
    return "entries: []\n";
  }

  const lines = ["entries:"];

  for (const entry of journal.entries) {
    lines.push(`  - step_id: "${escape(entry.step_id)}"`);
    lines.push(`    status: "${escape(entry.status)}"`);
    lines.push(`    decision: "${escape(entry.decision)}"`);
    lines.push(`    started_at: "${escape(entry.started_at)}"`);

    if (entry.completed_at !== undefined) {
      lines.push(`    completed_at: "${escape(entry.completed_at)}"`);
    }

    if (entry.duration_seconds !== undefined) {
      lines.push(`    duration_seconds: ${Number(entry.duration_seconds)}`);
    }

    if (entry.trigger !== undefined) {
      lines.push(`    trigger: "${escape(entry.trigger)}"`);
    }

    if (entry.human_response !== undefined) {
      lines.push(`    human_response: "${escape(entry.human_response)}"`);
    }

    if (entry.error !== undefined) {
      lines.push(`    error: "${escape(entry.error)}"`);
    }
  }

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Internal: YAML parsing
// ---------------------------------------------------------------------------

/**
 * Parses a session.yaml content string into a session manifest object.
 * Uses regex line-by-line parsing — no YAML library.
 *
 * @param {string} content
 * @returns {object}
 */
function parseSession(content) {
  const session = {
    session_id: "",
    playbook: "",
    feature: "",
    args: {},
    status: "",
    started_at: "",
    completed_at: "",
    current_step: "",
    worktree: "",
  };

  const lines = content.split("\n");
  let inArgs = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect transition out of args block when we hit a top-level key.
    if (inArgs) {
      // Indented lines inside args block: "  key: "value""
      const argMatch = line.match(/^  ([^:]+):\s*"(.*)"$/);
      if (argMatch) {
        session.args[argMatch[1].trim()] = unescape(argMatch[2]);
        continue;
      }
      // Not an indented args line — fall through to normal processing.
      inArgs = false;
    }

    // Top-level scalar fields with quoted values.
    const quotedMatch = line.match(/^([a-z_]+):\s*"(.*)"$/);
    if (quotedMatch) {
      const key = quotedMatch[1];
      const value = unescape(quotedMatch[2]);
      if (key in session && key !== "args") {
        session[key] = value;
      }
      continue;
    }

    // args: {} (empty map)
    if (line.match(/^args:\s*\{\}$/)) {
      session.args = {};
      continue;
    }

    // args: (start of block)
    if (line.match(/^args:\s*$/)) {
      inArgs = true;
      continue;
    }
  }

  return session;
}

/**
 * Parses a journal.yaml content string into a journal object.
 * Uses line-by-line parsing — no YAML library.
 *
 * @param {string} content
 * @returns {{ entries: Array<object> }}
 */
function parseJournal(content) {
  const trimmed = content.trim();

  // Empty journal.
  if (trimmed === "entries: []" || trimmed === "entries:[]") {
    return { entries: [] };
  }

  const lines = content.split("\n");
  const entries = [];
  let current = null;

  for (const line of lines) {
    // New entry starts with "  - step_id:"
    const entryStart = line.match(/^  - step_id:\s*"(.*)"$/);
    if (entryStart) {
      if (current !== null) {
        entries.push(current);
      }
      current = { step_id: unescape(entryStart[1]) };
      continue;
    }

    if (current === null) continue;

    // Quoted string fields inside an entry (indented with 4 spaces).
    const quotedField = line.match(/^    ([a-z_]+):\s*"(.*)"$/);
    if (quotedField) {
      current[quotedField[1]] = unescape(quotedField[2]);
      continue;
    }

    // Numeric field (duration_seconds).
    const numericField = line.match(/^    ([a-z_]+):\s*(\d+)$/);
    if (numericField) {
      current[numericField[1]] = Number(numericField[2]);
      continue;
    }
  }

  if (current !== null) {
    entries.push(current);
  }

  return { entries };
}

// ---------------------------------------------------------------------------
// Internal: string escaping for YAML double-quoted scalars
// ---------------------------------------------------------------------------

/**
 * Escapes a string value for safe inclusion inside YAML double quotes.
 * Escapes: backslash, double-quote, and common control characters.
 *
 * @param {string} value
 * @returns {string}
 */
function escape(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * Unescapes a YAML double-quoted scalar value.
 *
 * @param {string} value
 * @returns {string}
 */
function unescape(value) {
  return value
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}
