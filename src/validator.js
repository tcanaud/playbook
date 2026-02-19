/**
 * Playbook validator — `check` CLI command.
 *
 * Validates a playbook YAML file against the strict schema, collecting all
 * violations before reporting rather than stopping at the first error.
 *
 * Zero runtime dependencies: Node.js built-ins only.
 *
 * Exported surface:
 *   async function check(args) — entry point for the CLI `check` sub-command.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { parsePlaybook } from "./yaml-parser.js";

// ---------------------------------------------------------------------------
// Allowed value sets (must mirror yaml-parser.js — declared independently so
// the validator can produce human-readable error messages without coupling to
// parser internals).
// ---------------------------------------------------------------------------

const AUTONOMY_VALUES = ["auto", "gate_on_breaking", "gate_always", "skip"];
const ERROR_POLICY_VALUES = ["stop", "retry_once", "gate"];
const ESCALATION_TRIGGER_VALUES = [
  "postcondition_fail",
  "verdict_fail",
  "agreement_breaking",
  "subagent_error",
];
const CONDITION_VALUES = [
  "spec_exists",
  "plan_exists",
  "tasks_exists",
  "agreement_exists",
  "agreement_pass",
  "qa_plan_exists",
  "qa_verdict_pass",
  "pr_created",
];
const MODEL_VALUES = ["opus", "sonnet", "haiku"];

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

const SLUG_PATTERN = /^[a-z0-9-]+$/;

// Matches {{argname}} template references anywhere in a string.
const ARG_REF_PATTERN = /\{\{([^}]+)\}\}/g;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * CLI entry point for the `check` sub-command.
 *
 * @param {string[]} args — positional arguments after "check" (first element
 *   is the file path to validate).
 */
export async function check(args) {
  // 1. Parse CLI args.
  const filePath = args[0];
  if (!filePath) {
    process.stdout.write(
      "Usage: npx @tcanaud/playbook check <file>\n"
    );
    process.exit(1);
  }

  const resolvedPath = resolve(filePath);

  // 2. Read the file.
  if (!existsSync(resolvedPath)) {
    process.stdout.write(
      `\u2717 Cannot read file: ${filePath}\n`
    );
    process.exit(1);
  }

  const content = readFileSync(resolvedPath, "utf8");

  // 3. Parse the playbook — catch parse errors and report as a single violation.
  let playbook;
  try {
    playbook = parsePlaybook(content);
  } catch (err) {
    _printFailure(filePath, [`parse error: ${err.message}`]);
    process.exit(1);
  }

  // 4. Collect higher-level violations that the parser does not catch.
  const violations = _validatePlaybook(playbook, filePath);

  // 5. Report.
  if (violations.length === 0) {
    process.stdout.write(`\u2713 ${filePath} is valid\n`);
    process.exit(0);
  } else {
    _printFailure(filePath, violations);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Validation logic
// ---------------------------------------------------------------------------

/**
 * Run all higher-level validations over an already-parsed playbook object.
 *
 * Note: enum value checks and individual required-field checks are already
 * enforced by parsePlaybook() and will surface as parse errors. The
 * validations here cover:
 *   - Presence and non-emptiness of top-level fields (name, description,
 *     version, args, steps) — guarding against null/empty strings that the
 *     parser may have accepted.
 *   - name slug pattern.
 *   - steps array non-empty.
 *   - Per-step: required fields, id slug pattern, id uniqueness.
 *   - Per-step: enum values for autonomy, error_policy, escalation_triggers,
 *     preconditions, postconditions (redundant with parser but makes the
 *     validator self-contained and future-proof).
 *   - Referential integrity: {{argname}} references in step args must match a
 *     declared top-level arg name.
 *
 * @param {{ name, description, version, args, steps }} playbook
 * @param {string} filePath — used only for context in messages (unused here,
 *   violations are self-describing).
 * @returns {string[]} list of human-readable violation messages.
 */
function _validatePlaybook(playbook, _filePath) {
  const violations = [];

  // -------------------------------------------------------------------------
  // Top-level required fields
  // -------------------------------------------------------------------------

  const topLevelFields = ["name", "description", "version", "args", "steps"];
  for (const field of topLevelFields) {
    const value = playbook[field];
    if (value === null || value === undefined || value === "") {
      violations.push(`missing required top-level field "${field}"`);
    }
  }

  // -------------------------------------------------------------------------
  // name pattern
  // -------------------------------------------------------------------------

  if (playbook.name && !SLUG_PATTERN.test(playbook.name)) {
    violations.push(
      `name "${playbook.name}" must match pattern [a-z0-9-]+`
    );
  }

  // -------------------------------------------------------------------------
  // steps must be non-empty
  // -------------------------------------------------------------------------

  if (!Array.isArray(playbook.steps) || playbook.steps.length === 0) {
    violations.push("steps must contain at least 1 step");
  }

  // -------------------------------------------------------------------------
  // Collect declared arg names for referential integrity checks below.
  // -------------------------------------------------------------------------

  const declaredArgNames = new Set(
    Array.isArray(playbook.args)
      ? playbook.args.map((a) => a.name).filter(Boolean)
      : []
  );

  // -------------------------------------------------------------------------
  // Per-step validations
  // -------------------------------------------------------------------------

  const seenIds = new Set();

  for (const step of Array.isArray(playbook.steps) ? playbook.steps : []) {
    const stepRef = step.id ? `step "${step.id}"` : "step (unknown id)";

    // Required fields.
    for (const field of ["id", "command", "autonomy", "error_policy"]) {
      if (!step[field]) {
        violations.push(`${stepRef}: missing required field "${field}"`);
      }
    }

    // id pattern.
    if (step.id) {
      if (!SLUG_PATTERN.test(step.id)) {
        violations.push(
          `${stepRef}: id "${step.id}" must match pattern [a-z0-9-]+`
        );
      }

      // id uniqueness.
      if (seenIds.has(step.id)) {
        violations.push(`step id "${step.id}" is not unique`);
      } else {
        seenIds.add(step.id);
      }
    }

    // autonomy enum.
    if (step.autonomy && !AUTONOMY_VALUES.includes(step.autonomy)) {
      violations.push(
        `${stepRef}: autonomy "${step.autonomy}" is not valid ` +
          `(allowed: ${AUTONOMY_VALUES.join(", ")})`
      );
    }

    // error_policy enum.
    if (step.error_policy && !ERROR_POLICY_VALUES.includes(step.error_policy)) {
      violations.push(
        `${stepRef}: error_policy "${step.error_policy}" is not valid ` +
          `(allowed: ${ERROR_POLICY_VALUES.join(", ")})`
      );
    }

    // model enum.
    if (step.model && !MODEL_VALUES.includes(step.model)) {
      violations.push(
        `${stepRef}: model "${step.model}" is not valid ` +
          `(allowed: ${MODEL_VALUES.join(", ")})`
      );
    }

    // escalation_triggers enum.
    for (const trigger of step.escalation_triggers ?? []) {
      if (!ESCALATION_TRIGGER_VALUES.includes(trigger)) {
        violations.push(
          `${stepRef}: escalation_trigger "${trigger}" is not a known trigger ` +
            `(allowed: ${ESCALATION_TRIGGER_VALUES.join(", ")})`
        );
      }
    }

    // preconditions enum.
    for (const cond of step.preconditions ?? []) {
      if (!CONDITION_VALUES.includes(cond)) {
        violations.push(
          `${stepRef}: precondition "${cond}" is not a known condition ` +
            `(allowed: ${CONDITION_VALUES.join(", ")})`
        );
      }
    }

    // postconditions enum.
    for (const cond of step.postconditions ?? []) {
      if (!CONDITION_VALUES.includes(cond)) {
        violations.push(
          `${stepRef}: postcondition "${cond}" is not a known condition ` +
            `(allowed: ${CONDITION_VALUES.join(", ")})`
        );
      }
    }

    // {{argname}} referential integrity in step args string.
    if (typeof step.args === "string" && step.args.length > 0) {
      const refs = [...step.args.matchAll(ARG_REF_PATTERN)];
      for (const match of refs) {
        const argName = match[1].trim();
        if (!declaredArgNames.has(argName)) {
          violations.push(
            `${stepRef}: args references "{{${argName}}}" but "${argName}" is not a declared arg`
          );
        }
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

/**
 * Print the failure summary to stdout.
 *
 * @param {string} filePath
 * @param {string[]} violations
 */
function _printFailure(filePath, violations) {
  const count = violations.length;
  process.stdout.write(
    `\u2717 ${filePath} has ${count} violation(s):\n`
  );
  for (const v of violations) {
    process.stdout.write(`  - ${v}\n`);
  }
}
