/**
 * Tests for generated playbook output validation.
 *
 * Validates that a sample generated playbook YAML (the kind /playbook.create
 * would produce) passes the parser and validator with zero violations, and
 * conforms to all structural requirements.
 *
 * Uses Node.js built-in test runner: node:test + node:assert
 *
 * Run with: node --test tests/playbook-create.test.js
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parsePlaybook } from "../src/yaml-parser.js";

// ---------------------------------------------------------------------------
// Fixtures — sample generated playbook YAML
// ---------------------------------------------------------------------------

/**
 * A representative playbook that /playbook.create would generate for the
 * intention: "validate and deploy a hotfix for critical bugs"
 */
const GENERATED_PLAYBOOK = `
name: "critical-hotfix-deploy"
description: "Validate and deploy a hotfix for critical production bugs"
version: "1.0"

args:
  - name: "feature"
    description: "Feature branch name for the hotfix"
    required: true

steps:
  - id: "implement"
    command: "/speckit.implement"
    args: ""
    autonomy: "auto"
    preconditions: []
    postconditions: []
    error_policy: "retry_once"
    escalation_triggers:
      - "postcondition_fail"
      - "subagent_error"

  - id: "agreement-check"
    command: "/agreement.check"
    args: "{{feature}}"
    autonomy: "gate_on_breaking"
    preconditions: []
    postconditions:
      - "agreement_pass"
    error_policy: "gate"
    escalation_triggers:
      - "agreement_breaking"

  - id: "qa-plan"
    command: "/qa.plan"
    args: "{{feature}}"
    autonomy: "auto"
    preconditions:
      - "agreement_pass"
    postconditions:
      - "qa_plan_exists"
    error_policy: "stop"
    escalation_triggers: []

  - id: "qa-run"
    command: "/qa.run"
    args: "{{feature}}"
    autonomy: "auto"
    preconditions:
      - "qa_plan_exists"
    postconditions:
      - "qa_verdict_pass"
    error_policy: "gate"
    escalation_triggers:
      - "verdict_fail"

  - id: "pr"
    command: "/feature.pr"
    args: "{{feature}}"
    autonomy: "gate_always"
    preconditions:
      - "qa_verdict_pass"
    postconditions:
      - "pr_created"
    error_policy: "stop"
    escalation_triggers: []
`;

/**
 * A minimal generated playbook with a single step and no conditions.
 */
const MINIMAL_GENERATED = `
name: "quick-validate"
description: "Run QA validation on a feature"
version: "1.0"

args:
  - name: "feature"
    description: "Feature branch name"
    required: true

steps:
  - id: "qa-run"
    command: "/qa.run"
    args: "{{feature}}"
    autonomy: "auto"
    preconditions: []
    postconditions:
      - "qa_verdict_pass"
    error_policy: "gate"
    escalation_triggers:
      - "verdict_fail"
`;

/**
 * A generated playbook with multiple args demonstrating interpolation.
 */
const MULTI_ARG_GENERATED = `
name: "intake-to-spec"
description: "End-to-end flow from product intention to specification"
version: "1.0"

args:
  - name: "intention"
    description: "Free-text product intention or feature idea"
    required: true
  - name: "feature"
    description: "Feature branch name"
    required: true

steps:
  - id: "intake"
    command: "/product.intake"
    args: "{{intention}}"
    autonomy: "auto"
    preconditions: []
    postconditions: []
    error_policy: "gate"
    escalation_triggers:
      - "subagent_error"

  - id: "triage"
    command: "/product.triage"
    args: ""
    autonomy: "auto"
    preconditions: []
    postconditions: []
    error_policy: "gate"
    escalation_triggers:
      - "subagent_error"

  - id: "specify"
    command: "/speckit.specify"
    args: "{{feature}}"
    autonomy: "auto"
    preconditions: []
    postconditions:
      - "spec_exists"
    error_policy: "gate"
    escalation_triggers:
      - "postcondition_fail"
      - "subagent_error"
`;

// ---------------------------------------------------------------------------
// Allowed vocabulary (mirrors validator.js)
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

const SLUG_PATTERN = /^[a-z0-9-]+$/;
const ARG_REF_PATTERN = /\{\{([^}]+)\}\}/g;

// Patterns that indicate hardcoded feature-specific values
const HARDCODED_FEATURE_PATTERNS = [
  /\b\d{3}-[a-z]/i, // branch-like patterns: 013-my-feature
  /specs\/\d{3}/,     // hardcoded spec paths: specs/013-*/
  /\.agreements\/\d{3}/, // hardcoded agreement paths
  /\.qa\/\d{3}/,      // hardcoded QA paths
];

// ---------------------------------------------------------------------------
// Helper: run full validation suite on a parsed playbook
// ---------------------------------------------------------------------------

function validateGeneratedPlaybook(playbook, yamlString) {
  const violations = [];

  // 1. Name matches slug pattern
  if (!SLUG_PATTERN.test(playbook.name)) {
    violations.push(`name "${playbook.name}" does not match [a-z0-9-]+`);
  }

  // 2. Required top-level fields
  for (const field of ["name", "description", "version", "args", "steps"]) {
    if (playbook[field] === null || playbook[field] === undefined || playbook[field] === "") {
      violations.push(`missing required top-level field "${field}"`);
    }
  }

  // 3. At least one step
  if (!Array.isArray(playbook.steps) || playbook.steps.length === 0) {
    violations.push("steps must contain at least 1 step");
  }

  // 4. Collect declared arg names
  const declaredArgNames = new Set(
    Array.isArray(playbook.args)
      ? playbook.args.map((a) => a.name).filter(Boolean)
      : []
  );

  // 5. Per-step validation
  const seenIds = new Set();

  for (const step of playbook.steps) {
    const ref = step.id ? `step "${step.id}"` : "step (unknown)";

    // Required fields
    for (const field of ["id", "command", "autonomy", "error_policy"]) {
      if (!step[field]) {
        violations.push(`${ref}: missing required field "${field}"`);
      }
    }

    // ID slug pattern
    if (step.id && !SLUG_PATTERN.test(step.id)) {
      violations.push(`${ref}: id does not match [a-z0-9-]+`);
    }

    // ID uniqueness
    if (step.id) {
      if (seenIds.has(step.id)) {
        violations.push(`step id "${step.id}" is not unique`);
      }
      seenIds.add(step.id);
    }

    // Autonomy enum
    if (step.autonomy && !AUTONOMY_VALUES.has(step.autonomy)) {
      violations.push(`${ref}: autonomy "${step.autonomy}" is not valid`);
    }

    // Error policy enum
    if (step.error_policy && !ERROR_POLICY_VALUES.has(step.error_policy)) {
      violations.push(`${ref}: error_policy "${step.error_policy}" is not valid`);
    }

    // Escalation triggers enum
    for (const trigger of step.escalation_triggers ?? []) {
      if (!ESCALATION_TRIGGER_VALUES.has(trigger)) {
        violations.push(`${ref}: escalation_trigger "${trigger}" is not valid`);
      }
    }

    // Conditions enum
    for (const cond of step.preconditions ?? []) {
      if (!CONDITION_VALUES.has(cond)) {
        violations.push(`${ref}: precondition "${cond}" is not valid`);
      }
    }
    for (const cond of step.postconditions ?? []) {
      if (!CONDITION_VALUES.has(cond)) {
        violations.push(`${ref}: postcondition "${cond}" is not valid`);
      }
    }

    // {{arg}} referential integrity
    if (typeof step.args === "string" && step.args.length > 0) {
      const refs = [...step.args.matchAll(ARG_REF_PATTERN)];
      for (const match of refs) {
        const argName = match[1].trim();
        if (!declaredArgNames.has(argName)) {
          violations.push(`${ref}: references "{{${argName}}}" but "${argName}" is not a declared arg`);
        }
      }
    }
  }

  // 6. No hardcoded feature values in the YAML string
  for (const pattern of HARDCODED_FEATURE_PATTERNS) {
    if (pattern.test(yamlString)) {
      violations.push(`YAML contains hardcoded feature-specific value matching ${pattern}`);
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generated playbook — parsing", () => {
  test("full generated playbook parses without error", () => {
    const result = parsePlaybook(GENERATED_PLAYBOOK);
    assert.ok(result, "parsePlaybook should return a result");
  });

  test("minimal generated playbook parses without error", () => {
    const result = parsePlaybook(MINIMAL_GENERATED);
    assert.ok(result, "parsePlaybook should return a result");
  });

  test("multi-arg generated playbook parses without error", () => {
    const result = parsePlaybook(MULTI_ARG_GENERATED);
    assert.ok(result, "parsePlaybook should return a result");
  });
});

describe("generated playbook — validation", () => {
  test("full generated playbook has zero violations", () => {
    const playbook = parsePlaybook(GENERATED_PLAYBOOK);
    const violations = validateGeneratedPlaybook(playbook, GENERATED_PLAYBOOK);
    assert.deepEqual(violations, [], `Expected zero violations, got: ${violations.join(", ")}`);
  });

  test("minimal generated playbook has zero violations", () => {
    const playbook = parsePlaybook(MINIMAL_GENERATED);
    const violations = validateGeneratedPlaybook(playbook, MINIMAL_GENERATED);
    assert.deepEqual(violations, [], `Expected zero violations, got: ${violations.join(", ")}`);
  });

  test("multi-arg generated playbook has zero violations", () => {
    const playbook = parsePlaybook(MULTI_ARG_GENERATED);
    const violations = validateGeneratedPlaybook(playbook, MULTI_ARG_GENERATED);
    assert.deepEqual(violations, [], `Expected zero violations, got: ${violations.join(", ")}`);
  });
});

describe("generated playbook — name validation", () => {
  test("playbook name matches slug pattern [a-z0-9-]+", () => {
    const playbook = parsePlaybook(GENERATED_PLAYBOOK);
    assert.match(playbook.name, SLUG_PATTERN, `name "${playbook.name}" should match [a-z0-9-]+`);
  });

  test("all fixture playbooks have valid slug names", () => {
    for (const yaml of [GENERATED_PLAYBOOK, MINIMAL_GENERATED, MULTI_ARG_GENERATED]) {
      const playbook = parsePlaybook(yaml);
      assert.match(playbook.name, SLUG_PATTERN, `name "${playbook.name}" should match [a-z0-9-]+`);
    }
  });
});

describe("generated playbook — step ID uniqueness", () => {
  test("full generated playbook has unique step IDs", () => {
    const playbook = parsePlaybook(GENERATED_PLAYBOOK);
    const ids = playbook.steps.map((s) => s.id);
    const uniqueIds = new Set(ids);
    assert.equal(ids.length, uniqueIds.size, `Step IDs must be unique. Found: ${ids.join(", ")}`);
  });

  test("all fixture playbooks have unique step IDs", () => {
    for (const yaml of [GENERATED_PLAYBOOK, MINIMAL_GENERATED, MULTI_ARG_GENERATED]) {
      const playbook = parsePlaybook(yaml);
      const ids = playbook.steps.map((s) => s.id);
      const uniqueIds = new Set(ids);
      assert.equal(ids.length, uniqueIds.size, `Step IDs must be unique in "${playbook.name}"`);
    }
  });
});

describe("generated playbook — {{arg}} referential integrity", () => {
  test("all {{arg}} references match declared args", () => {
    const playbook = parsePlaybook(GENERATED_PLAYBOOK);
    const declaredArgs = new Set(playbook.args.map((a) => a.name));

    for (const step of playbook.steps) {
      if (typeof step.args === "string" && step.args.length > 0) {
        const refs = [...step.args.matchAll(ARG_REF_PATTERN)];
        for (const match of refs) {
          const argName = match[1].trim();
          assert.ok(
            declaredArgs.has(argName),
            `Step "${step.id}" references {{${argName}}} but "${argName}" is not declared in args`
          );
        }
      }
    }
  });

  test("multi-arg playbook has all references resolved", () => {
    const playbook = parsePlaybook(MULTI_ARG_GENERATED);
    const declaredArgs = new Set(playbook.args.map((a) => a.name));

    for (const step of playbook.steps) {
      if (typeof step.args === "string" && step.args.length > 0) {
        const refs = [...step.args.matchAll(ARG_REF_PATTERN)];
        for (const match of refs) {
          const argName = match[1].trim();
          assert.ok(
            declaredArgs.has(argName),
            `Step "${step.id}" references {{${argName}}} but "${argName}" is not declared`
          );
        }
      }
    }
  });
});

describe("generated playbook — no hardcoded feature values", () => {
  test("full generated playbook contains no hardcoded feature references", () => {
    for (const pattern of HARDCODED_FEATURE_PATTERNS) {
      assert.ok(
        !pattern.test(GENERATED_PLAYBOOK),
        `YAML should not contain hardcoded feature pattern: ${pattern}`
      );
    }
  });

  test("all fixture playbooks contain no hardcoded feature references", () => {
    for (const yaml of [GENERATED_PLAYBOOK, MINIMAL_GENERATED, MULTI_ARG_GENERATED]) {
      for (const pattern of HARDCODED_FEATURE_PATTERNS) {
        assert.ok(
          !pattern.test(yaml),
          `YAML should not contain hardcoded feature pattern: ${pattern}`
        );
      }
    }
  });
});

describe("generated playbook — structural correctness", () => {
  test("version is 1.0", () => {
    const playbook = parsePlaybook(GENERATED_PLAYBOOK);
    assert.equal(playbook.version, "1.0");
  });

  test("description is non-empty", () => {
    const playbook = parsePlaybook(GENERATED_PLAYBOOK);
    assert.ok(playbook.description.length > 0, "description should be non-empty");
  });

  test("has at least one step", () => {
    const playbook = parsePlaybook(GENERATED_PLAYBOOK);
    assert.ok(playbook.steps.length >= 1, "should have at least 1 step");
  });

  test("all step IDs match slug pattern", () => {
    const playbook = parsePlaybook(GENERATED_PLAYBOOK);
    for (const step of playbook.steps) {
      assert.match(step.id, SLUG_PATTERN, `step id "${step.id}" should match [a-z0-9-]+`);
    }
  });

  test("all autonomy values are valid enums", () => {
    const playbook = parsePlaybook(GENERATED_PLAYBOOK);
    for (const step of playbook.steps) {
      assert.ok(
        AUTONOMY_VALUES.has(step.autonomy),
        `step "${step.id}": autonomy "${step.autonomy}" should be valid`
      );
    }
  });

  test("all error_policy values are valid enums", () => {
    const playbook = parsePlaybook(GENERATED_PLAYBOOK);
    for (const step of playbook.steps) {
      assert.ok(
        ERROR_POLICY_VALUES.has(step.error_policy),
        `step "${step.id}": error_policy "${step.error_policy}" should be valid`
      );
    }
  });

  test("all conditions are from the allowed vocabulary", () => {
    const playbook = parsePlaybook(GENERATED_PLAYBOOK);
    for (const step of playbook.steps) {
      for (const cond of step.preconditions) {
        assert.ok(CONDITION_VALUES.has(cond), `precondition "${cond}" should be valid`);
      }
      for (const cond of step.postconditions) {
        assert.ok(CONDITION_VALUES.has(cond), `postcondition "${cond}" should be valid`);
      }
    }
  });

  test("all escalation triggers are from the allowed vocabulary", () => {
    const playbook = parsePlaybook(GENERATED_PLAYBOOK);
    for (const step of playbook.steps) {
      for (const trigger of step.escalation_triggers) {
        assert.ok(
          ESCALATION_TRIGGER_VALUES.has(trigger),
          `escalation_trigger "${trigger}" should be valid`
        );
      }
    }
  });
});
