/**
 * Regex-based YAML parser specialized for the playbook schema.
 *
 * Handles only the known playbook vocabulary — not arbitrary YAML.
 * Zero runtime dependencies: Node.js built-ins only.
 *
 * Exported surface:
 *   parsePlaybook(content) → { name, description, version, args, steps }
 *   throws Error with descriptive message on invalid input.
 */

// ---------------------------------------------------------------------------
// Enum vocabularies (closed sets — validated during parsing)
// ---------------------------------------------------------------------------

const AUTONOMY_VALUES = new Set(["auto", "gate_on_breaking", "gate_always", "skip"]);
const ERROR_POLICY_VALUES = new Set(["stop", "retry_once", "gate"]);
const ESCALATION_TRIGGER_VALUES = new Set([
  "postcondition_fail",
  "verdict_fail",
  "agreement_breaking",
  "subagent_error",
]);
const CONDITION_VALUES = new Set([
  "spec_exists",
  "plan_exists",
  "tasks_exists",
  "agreement_exists",
  "agreement_pass",
  "qa_plan_exists",
  "qa_verdict_pass",
  "pr_created",
]);

// ---------------------------------------------------------------------------
// Low-level string helpers
// ---------------------------------------------------------------------------

/**
 * Strip a leading/trailing quoted wrapper from a scalar value.
 * Handles both single-quote and double-quote wrapping.
 *
 * "hello world"  → hello world
 * 'hello world'  → hello world
 * hello world    → hello world (unchanged)
 */
function unquote(raw) {
  const s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Return the number of leading spaces on a line (tab = error, not supported).
 */
function indentOf(line) {
  let i = 0;
  while (i < line.length && line[i] === " ") i++;
  return i;
}

/**
 * Parse an inline YAML list: [a, b, c] → ["a", "b", "c"]
 * Values may be quoted or unquoted. Empty list → [].
 */
function parseInlineList(raw) {
  const s = raw.trim();
  if (!s.startsWith("[") || !s.endsWith("]")) {
    throw new Error(`Expected inline list syntax [a, b, ...], got: ${raw}`);
  }
  const inner = s.slice(1, -1).trim();
  if (inner === "") return [];

  const items = [];
  // Simple split-by-comma, then unquote each token.
  // Quoted values may contain commas — handle by walking character-by-character.
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === ",") {
      items.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "") {
    items.push(current.trim());
  }
  return items;
}

// ---------------------------------------------------------------------------
// Line-oriented parsing primitives
// ---------------------------------------------------------------------------

/**
 * Try to match a scalar key: value line.
 * Returns { key, value } or null.
 *
 * Accepted formats:
 *   key: value
 *   key: "value"
 *   key: 'value'
 *   key:          (empty value → "")
 */
function matchKeyValue(line) {
  // Match: optional-indent key: rest
  const m = line.match(/^(\s*)([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*?)\s*$/);
  if (!m) return null;
  return { indent: m[1].length, key: m[2], rawValue: m[3] };
}

/**
 * Try to match a list-item line: "  - value"
 * Returns { indent, rawValue } or null.
 */
function matchListItem(line) {
  const m = line.match(/^(\s*)-\s+(.*?)\s*$/);
  if (!m) return null;
  return { indent: m[1].length, rawValue: m[2] };
}

/**
 * Return true if the line is purely a "- " block prefix with no value
 * (i.e. the list item is a mapping block starting on the next lines).
 */
function isBlockMappingStart(rawValue) {
  return rawValue.trim() === "";
}

// ---------------------------------------------------------------------------
// Main parser state machine
// ---------------------------------------------------------------------------

/**
 * Parse a playbook YAML string into a structured object.
 *
 * @param {string} content — raw YAML text
 * @returns {{ name: string, description: string, version: string, args: Arg[], steps: Step[] }}
 * @throws {Error} on schema violations or unrecognised structure
 */
export function parsePlaybook(content) {
  if (typeof content !== "string") {
    throw new Error("parsePlaybook: content must be a string");
  }

  const rawLines = content.split("\n");

  // Normalise: strip trailing CR (Windows line endings), keep empty lines for
  // indentation tracking but drop pure-comment lines immediately.
  const lines = rawLines.map((l) => l.replace(/\r$/, ""));

  const result = {
    name: null,
    description: null,
    version: null,
    args: [],
    steps: [],
  };

  // -----------------------------------------------------------------------
  // State machine
  // -----------------------------------------------------------------------
  // context: "top" | "args" | "args_item" | "steps" | "steps_item"
  let context = "top";

  // The item currently being assembled (an Arg or Step object).
  let currentItem = null;

  // When inside a step, we may be collecting a multi-line list for a list
  // field (preconditions, postconditions, escalation_triggers).
  // listField: name of the field | null
  // listIndent: indentation level of the "- value" items in the list
  let listField = null;
  let listIndent = null;

  // Indentation of the "- " that opened the current item block.
  let itemDashIndent = null;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;

    // Skip blank lines and comment lines at any context level.
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const currentIndent = indentOf(line);

    // -------------------------------------------------------------------
    // TOP-LEVEL context — scalar fields and section keys
    // -------------------------------------------------------------------
    if (context === "top") {
      const kv = matchKeyValue(line);
      if (!kv) {
        throw new Error(
          `Line ${lineNum}: unexpected content at top level: ${line.trim()}`
        );
      }

      if (kv.indent !== 0) {
        throw new Error(
          `Line ${lineNum}: unexpected indentation at top level: ${line.trim()}`
        );
      }

      switch (kv.key) {
        case "name":
          result.name = unquote(kv.rawValue);
          break;
        case "description":
          result.description = unquote(kv.rawValue);
          break;
        case "version":
          result.version = unquote(kv.rawValue);
          break;
        case "args":
          // "args:" with inline empty list [] → keep result.args as []
          // "args:" with no value → block list follows on next lines
          if (kv.rawValue === "[]" || kv.rawValue === "[ ]") {
            // Inline empty list — args stays []
          } else if (kv.rawValue === "") {
            context = "args";
          } else {
            throw new Error(
              `Line ${lineNum}: "args" must be an empty inline list [] or a block list`
            );
          }
          break;
        case "steps":
          // "steps:" with inline empty list [] → keep result.steps as [] (will
          // fail the "at least one step" check later)
          if (kv.rawValue === "[]" || kv.rawValue === "[ ]") {
            // Inline empty — stays empty (validation error will fire at the end)
          } else if (kv.rawValue === "") {
            context = "steps";
          } else {
            throw new Error(
              `Line ${lineNum}: "steps" must be a block list`
            );
          }
          break;
        default:
          // Unknown top-level key — ignore silently to allow comment-only
          // metadata fields. Actually, per spec we should be strict.
          throw new Error(
            `Line ${lineNum}: unknown top-level field "${kv.key}"`
          );
      }
      continue;
    }

    // -------------------------------------------------------------------
    // ARGS context — waiting for the first "- " list item
    // -------------------------------------------------------------------
    if (context === "args") {
      const listItem = matchListItem(line);
      if (listItem) {
        // Flush any pending item first (none here, first item).
        currentItem = { name: null, description: null, required: null };
        itemDashIndent = listItem.indent;
        context = "args_item";

        if (!isBlockMappingStart(listItem.rawValue)) {
          // Inline key: value on same line as "-"  (shouldn't happen for args
          // but handle defensively).
          _applyArgField(currentItem, listItem.rawValue, lineNum);
        }
        continue;
      }

      // A top-level key at indent=0 means we left the args section.
      const kv = matchKeyValue(line);
      if (kv && kv.indent === 0) {
        // Re-process this line in top context.
        context = "top";
        lineIdx--;
        continue;
      }

      throw new Error(`Line ${lineNum}: unexpected content in args section: ${line.trim()}`);
    }

    // -------------------------------------------------------------------
    // ARGS_ITEM context — key: value fields of a single arg entry
    // -------------------------------------------------------------------
    if (context === "args_item") {
      // Check if we're back to a new list item at the same dash indent.
      const listItem = matchListItem(line);
      if (listItem && listItem.indent === itemDashIndent) {
        // Finalise current item.
        _validateArg(currentItem, result.args.length + 1);
        result.args.push(currentItem);

        // Start new item.
        currentItem = { name: null, description: null, required: null };
        itemDashIndent = listItem.indent;

        if (!isBlockMappingStart(listItem.rawValue)) {
          _applyArgField(currentItem, listItem.rawValue, lineNum);
        }
        continue;
      }

      // A top-level key at indent=0 means args section ended.
      const kv = matchKeyValue(line);
      if (kv && kv.indent === 0) {
        _validateArg(currentItem, result.args.length + 1);
        result.args.push(currentItem);
        currentItem = null;
        context = "top";
        lineIdx--;
        continue;
      }

      // Otherwise it must be a key: value for the current arg item.
      if (kv) {
        _applyArgField(currentItem, line, lineNum);
        continue;
      }

      throw new Error(
        `Line ${lineNum}: unexpected content in args item: ${line.trim()}`
      );
    }

    // -------------------------------------------------------------------
    // STEPS context — waiting for the first "- " list item
    // -------------------------------------------------------------------
    if (context === "steps") {
      const listItem = matchListItem(line);
      if (listItem) {
        currentItem = _emptyStep();
        itemDashIndent = listItem.indent;
        listField = null;
        listIndent = null;
        context = "steps_item";

        if (!isBlockMappingStart(listItem.rawValue)) {
          _applyStepField(currentItem, listItem.rawValue, lineNum);
        }
        continue;
      }

      const kv = matchKeyValue(line);
      if (kv && kv.indent === 0) {
        context = "top";
        lineIdx--;
        continue;
      }

      throw new Error(`Line ${lineNum}: unexpected content in steps section: ${line.trim()}`);
    }

    // -------------------------------------------------------------------
    // STEPS_ITEM context — fields of a single step entry
    // -------------------------------------------------------------------
    if (context === "steps_item") {
      // Are we collecting a multi-line list (preconditions / postconditions /
      // escalation_triggers)?
      if (listField !== null) {
        const listItem = matchListItem(line);
        if (listItem && listItem.indent === listIndent) {
          // Another list item for the active list field.
          const val = unquote(listItem.rawValue);
          _validateConditionOrTrigger(listField, val, lineNum);
          currentItem[listField].push(val);
          continue;
        }
        // No longer in the list — fall through to normal field processing.
        listField = null;
        listIndent = null;
      }

      // New step item at the same dash indentation → flush current step.
      const listItem = matchListItem(line);
      if (listItem && listItem.indent === itemDashIndent) {
        _validateStep(currentItem, result.steps.length + 1);
        result.steps.push(currentItem);

        currentItem = _emptyStep();
        itemDashIndent = listItem.indent;
        listField = null;
        listIndent = null;

        if (!isBlockMappingStart(listItem.rawValue)) {
          _applyStepField(currentItem, listItem.rawValue, lineNum);
        }
        continue;
      }

      // Top-level key at indent=0 → steps section ended.
      const kv = matchKeyValue(line);
      if (kv && kv.indent === 0) {
        _validateStep(currentItem, result.steps.length + 1);
        result.steps.push(currentItem);
        currentItem = null;
        listField = null;
        listIndent = null;
        context = "top";
        lineIdx--;
        continue;
      }

      // Regular key: value field for the current step.
      if (kv) {
        // Detect list fields that use block-style (no inline value).
        const blockListFields = new Set([
          "preconditions",
          "postconditions",
          "escalation_triggers",
        ]);

        if (blockListFields.has(kv.key)) {
          if (kv.rawValue.startsWith("[")) {
            // Inline list syntax: preconditions: [a, b]
            const items = parseInlineList(kv.rawValue);
            _validateListField(kv.key, items, lineNum);
            currentItem[kv.key] = items;
          } else if (kv.rawValue === "") {
            // Block list starts on subsequent lines.
            listField = kv.key;
            // The list items will be at indent > kv.indent.
            // We'll detect their indent from the first item.
            listIndent = currentIndent + 2; // standard YAML 2-space indent
          } else {
            throw new Error(
              `Line ${lineNum}: field "${kv.key}" must be a list (inline [a,b] or block "- item")`
            );
          }
          continue;
        }

        _applyStepField(currentItem, line, lineNum);
        continue;
      }

      // It could be a list item for a block list started with no inline value,
      // but with a non-standard indent. Handle generically.
      if (listField !== null) {
        const li = matchListItem(line);
        if (li) {
          const val = unquote(li.rawValue);
          _validateConditionOrTrigger(listField, val, lineNum);
          currentItem[listField].push(val);
          // Calibrate listIndent from first actual item.
          if (listIndent === null) listIndent = li.indent;
          continue;
        }
      }

      throw new Error(
        `Line ${lineNum}: unexpected content in step item: ${line.trim()}`
      );
    }
  }

  // -----------------------------------------------------------------------
  // Flush any in-progress item at end of file
  // -----------------------------------------------------------------------
  if (context === "args_item" && currentItem !== null) {
    _validateArg(currentItem, result.args.length + 1);
    result.args.push(currentItem);
  }
  if (context === "steps_item" && currentItem !== null) {
    _validateStep(currentItem, result.steps.length + 1);
    result.steps.push(currentItem);
  }

  // -----------------------------------------------------------------------
  // Top-level required field validation
  // -----------------------------------------------------------------------
  if (!result.name) {
    throw new Error('Playbook is missing required top-level field "name"');
  }
  if (!result.description) {
    throw new Error('Playbook is missing required top-level field "description"');
  }
  if (!result.version) {
    throw new Error('Playbook is missing required top-level field "version"');
  }
  if (result.steps.length === 0) {
    throw new Error("Playbook must define at least one step");
  }

  return result;
}

// ---------------------------------------------------------------------------
// Field applicators
// ---------------------------------------------------------------------------

/**
 * Apply a single "key: value" line to an arg item.
 * `lineOrKv` may be either the raw line string or just "key: value" portion.
 */
function _applyArgField(item, lineOrKv, lineNum) {
  const kv = matchKeyValue(lineOrKv);
  if (!kv) {
    throw new Error(`Line ${lineNum}: cannot parse arg field: ${lineOrKv}`);
  }
  const value = unquote(kv.rawValue);
  switch (kv.key) {
    case "name":
      item.name = value;
      break;
    case "description":
      item.description = value;
      break;
    case "required":
      if (value !== "true" && value !== "false") {
        throw new Error(
          `Line ${lineNum}: arg "required" must be true or false, got: ${value}`
        );
      }
      item.required = value === "true";
      break;
    default:
      throw new Error(`Line ${lineNum}: unknown arg field "${kv.key}"`);
  }
}

/**
 * Apply a single "key: value" line to a step item.
 * Handles scalar fields only; list fields are managed by the caller.
 */
function _applyStepField(item, lineOrKv, lineNum) {
  const kv = matchKeyValue(lineOrKv);
  if (!kv) {
    throw new Error(`Line ${lineNum}: cannot parse step field: ${lineOrKv}`);
  }
  const value = unquote(kv.rawValue);
  switch (kv.key) {
    case "id":
      if (!/^[a-z0-9-]+$/.test(value)) {
        throw new Error(
          `Line ${lineNum}: step id "${value}" must match [a-z0-9-]+`
        );
      }
      item.id = value;
      break;
    case "command":
      item.command = value;
      break;
    case "args":
      item.args = value;
      break;
    case "autonomy":
      if (!AUTONOMY_VALUES.has(value)) {
        throw new Error(
          `Line ${lineNum}: autonomy "${value}" is not valid (allowed: ${[...AUTONOMY_VALUES].join(", ")})`
        );
      }
      item.autonomy = value;
      break;
    case "error_policy":
      if (!ERROR_POLICY_VALUES.has(value)) {
        throw new Error(
          `Line ${lineNum}: error_policy "${value}" is not valid (allowed: ${[...ERROR_POLICY_VALUES].join(", ")})`
        );
      }
      item.error_policy = value;
      break;
    case "parallel_group":
      item.parallel_group = value;
      break;
    case "preconditions":
    case "postconditions":
    case "escalation_triggers": {
      // Inline list on the same line as the key.
      if (value.startsWith("[")) {
        const items = parseInlineList(value);
        _validateListField(kv.key, items, lineNum);
        item[kv.key] = items;
      } else if (value === "") {
        // Block list: items follow on next lines — handled by caller's listField
        // tracking. Here we just initialise to empty; caller sets listField.
        item[kv.key] = [];
      } else {
        throw new Error(
          `Line ${lineNum}: field "${kv.key}" must be a list`
        );
      }
      break;
    }
    default:
      throw new Error(`Line ${lineNum}: unknown step field "${kv.key}"`);
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function _validateConditionOrTrigger(field, value, lineNum) {
  if (field === "escalation_triggers") {
    if (!ESCALATION_TRIGGER_VALUES.has(value)) {
      throw new Error(
        `Line ${lineNum}: escalation_trigger "${value}" is not valid ` +
          `(allowed: ${[...ESCALATION_TRIGGER_VALUES].join(", ")})`
      );
    }
  } else {
    // preconditions or postconditions
    if (!CONDITION_VALUES.has(value)) {
      throw new Error(
        `Line ${lineNum}: condition "${value}" is not valid ` +
          `(allowed: ${[...CONDITION_VALUES].join(", ")})`
      );
    }
  }
}

function _validateListField(field, items, lineNum) {
  for (const item of items) {
    _validateConditionOrTrigger(field, item, lineNum);
  }
}

function _validateArg(arg, index) {
  if (!arg.name) {
    throw new Error(`args[${index}]: missing required field "name"`);
  }
  if (!arg.description) {
    throw new Error(`args[${index}] "${arg.name}": missing required field "description"`);
  }
  if (arg.required === null) {
    throw new Error(`args[${index}] "${arg.name}": missing required field "required"`);
  }
}

function _validateStep(step, index) {
  const ref = step.id ? `step "${step.id}"` : `steps[${index}]`;
  if (!step.id) {
    throw new Error(`${ref}: missing required field "id"`);
  }
  if (!step.command) {
    throw new Error(`${ref}: missing required field "command"`);
  }
  if (!step.autonomy) {
    throw new Error(`${ref}: missing required field "autonomy"`);
  }
  if (!step.error_policy) {
    throw new Error(`${ref}: missing required field "error_policy"`);
  }
}

// ---------------------------------------------------------------------------
// Object factories
// ---------------------------------------------------------------------------

function _emptyStep() {
  return {
    id: null,
    command: null,
    args: "",
    autonomy: null,
    preconditions: [],
    postconditions: [],
    error_policy: null,
    escalation_triggers: [],
    parallel_group: null,
  };
}
