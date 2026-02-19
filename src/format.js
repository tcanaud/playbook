/**
 * Formatting utilities for session display.
 *
 * Provides human-readable table formatting and JSON output for session data.
 * All output is terminal-friendly with consistent alignment and no color codes.
 */

import { TABLE_COLUMNS, COLUMN_WIDTHS, STATUS_LABELS_PLAIN } from "./constants.js";

/**
 * Formats an array of sessions into a human-readable table string.
 *
 * Table format:
 *   ID               CREATED              STATUS
 *   20260219-abc     2026-02-19 19:22     Running
 *   20260219-def     2026-02-19 19:15     Completed
 *
 * @param {Array<{ id: string, createdAt: string, status: string }>} sessions
 * @returns {string} Formatted table string
 */
export function formatSessionsTable(sessions) {
  if (!sessions || sessions.length === 0) {
    return ""; // Empty table
  }

  const lines = [];

  // Header row
  const idWidth = 17;
  const createdWidth = 20;
  const statusWidth = 12;
  const header = `${TABLE_COLUMNS.ID.padEnd(idWidth)} ${TABLE_COLUMNS.CREATED.padEnd(createdWidth)} ${TABLE_COLUMNS.STATUS.padEnd(statusWidth)}`;
  lines.push(header);
  lines.push("-".repeat(Math.min(80, header.length)));

  // Data rows
  for (const session of sessions) {
    const id = (session.id || "").substring(0, 15).padEnd(idWidth);
    const createdAt = formatTimestamp(session.createdAt);
    const created = createdAt.padEnd(createdWidth);
    const status = getStatusLabel(session.status).padEnd(statusWidth);

    lines.push(`${id} ${created} ${status}`);
  }

  return lines.join("\n");
}

/**
 * Formats an array of sessions as JSON.
 *
 * @param {Array<{ id: string, createdAt: string, status: string }>} sessions
 * @returns {string} JSON string
 */
export function formatSessionsJson(sessions) {
  if (!sessions || sessions.length === 0) {
    return "[]";
  }

  const jsonSessions = sessions.map((session) => ({
    id: session.id,
    createdAt: session.createdAt,
    status: getStatusLabel(session.status).replace(/^[^A-Z]*/, "").trim(), // Extract plain text
  }));

  return JSON.stringify(jsonSessions, null, 2);
}

/**
 * Formats a timestamp (ISO 8601 string) to human-readable format.
 *
 * Input:  "2026-02-19T19:22:15.000Z"
 * Output: "2026-02-19 19:22"
 *
 * @param {string} isoTimestamp - ISO 8601 timestamp
 * @returns {string} Human-readable timestamp
 */
function formatTimestamp(isoTimestamp) {
  try {
    if (!isoTimestamp) return "N/A";

    const date = new Date(isoTimestamp);
    if (isNaN(date.getTime())) return "N/A";

    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");
    const hh = String(date.getUTCHours()).padStart(2, "0");
    const min = String(date.getUTCMinutes()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  } catch {
    return "N/A";
  }
}

/**
 * Gets a human-friendly status label with text indicators.
 * Uses text markers (→ for running, ✓ for completed, ✗ for failed) for clarity
 * without relying on color codes or emoji.
 *
 * @param {string} status - Session status value
 * @returns {string} Human-friendly label with text indicator
 */
function getStatusLabel(status) {
  const label = STATUS_LABELS_PLAIN[status] || status;

  // Add text indicators for visual distinction
  const statusLower = (status || "").toLowerCase();
  if (statusLower === "running" || statusLower === "in_progress" || statusLower === "pending") {
    return `→ ${label}`;
  } else if (statusLower === "completed") {
    return `✓ ${label}`;
  } else if (statusLower === "failed") {
    return `✗ ${label}`;
  }

  return label;
}
