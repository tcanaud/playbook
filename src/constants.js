/**
 * Constants for playbook CLI commands.
 *
 * Defines session statuses, status labels, and formatting strings.
 */

// Session status values
export const SESSION_STATUS = {
  RUNNING: "running",
  IN_PROGRESS: "in_progress",
  PENDING: "pending",
  COMPLETED: "completed",
  FAILED: "failed",
};

// Human-friendly status labels
export const STATUS_LABELS = {
  running: "🔄 Running",
  in_progress: "🔄 Running",
  pending: "⏳ Pending",
  completed: "✓ Completed",
  failed: "✗ Failed",
};

// For JSON output, use plain text status values
export const STATUS_LABELS_PLAIN = {
  running: "Running",
  in_progress: "Running",
  pending: "Pending",
  completed: "Completed",
  failed: "Failed",
};

// Table formatting constants
export const TABLE_COLUMNS = {
  ID: "ID",
  CREATED: "CREATED",
  STATUS: "STATUS",
};

// Terminal width constraint
export const MAX_TERMINAL_WIDTH = 80;

// Column widths (IDs can be variable, adjust as needed)
export const COLUMN_WIDTHS = {
  id: 16,      // "20260219-abc" + padding
  created: 16, // "2026-02-19 19:22" + padding
  status: 12,  // "Running" or "Completed" + padding
};
