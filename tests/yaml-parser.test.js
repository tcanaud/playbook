/**
 * Tests for the playbook YAML parser.
 * Uses Node.js built-in test runner: node:test + node:assert
 *
 * Run with: node --test tests/yaml-parser.test.js
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parsePlaybook } from "../src/yaml-parser.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MINIMAL_PLAYBOOK = `
name: minimal
description: A minimal playbook
version: "1.0"

args: []

steps:
  - id: first-step
    command: /some.command
    autonomy: auto
    error_policy: stop
`;

// Full auto-feature playbook from the data model (unquoted where possible)
const FULL_PLAYBOOK = `
name: auto-feature
description: Full feature workflow from plan to PR
version: "1.0"

args:
  - name: feature
    description: Feature branch name
    required: true

steps:
  - id: plan
    command: /speckit.plan
    args: ""
    autonomy: auto
    preconditions:
      - spec_exists
    postconditions:
      - plan_exists
    error_policy: stop
    escalation_triggers: []

  - id: tasks
    command: /speckit.tasks
    args: ""
    autonomy: auto
    preconditions:
      - plan_exists
    postconditions:
      - tasks_exists
    error_policy: stop
    escalation_triggers: []

  - id: agreement
    command: /agreement.create
    args: "{{feature}}"
    autonomy: auto
    preconditions:
      - tasks_exists
    postconditions:
      - agreement_exists
    error_policy: gate
    escalation_triggers:
      - subagent_error

  - id: implement
    command: /speckit.implement
    args: ""
    autonomy: auto
    preconditions:
      - agreement_exists
    postconditions: []
    error_policy: retry_once
    escalation_triggers:
      - postcondition_fail
      - subagent_error

  - id: agreement-check
    command: /agreement.check
    args: "{{feature}}"
    autonomy: gate_on_breaking
    preconditions: []
    postconditions:
      - agreement_pass
    error_policy: gate
    escalation_triggers:
      - agreement_breaking

  - id: qa-plan
    command: /qa.plan
    args: "{{feature}}"
    autonomy: auto
    preconditions:
      - agreement_pass
    postconditions:
      - qa_plan_exists
    error_policy: stop
    escalation_triggers: []

  - id: qa-run
    command: /qa.run
    args: "{{feature}}"
    autonomy: auto
    preconditions:
      - qa_plan_exists
    postconditions:
      - qa_verdict_pass
    error_policy: gate
    escalation_triggers:
      - verdict_fail

  - id: pr
    command: /feature.pr
    args: "{{feature}}"
    autonomy: gate_always
    preconditions:
      - qa_verdict_pass
    postconditions:
      - pr_created
    error_policy: stop
    escalation_triggers: []
`;

// ---------------------------------------------------------------------------
// Happy-path tests
// ---------------------------------------------------------------------------

describe("parsePlaybook — happy path", () => {
  test("parses minimal playbook with inline empty args", () => {
    const result = parsePlaybook(MINIMAL_PLAYBOOK);
    assert.equal(result.name, "minimal");
    assert.equal(result.description, "A minimal playbook");
    assert.equal(result.version, "1.0");
    assert.deepEqual(result.args, []);
    assert.equal(result.steps.length, 1);
    assert.equal(result.steps[0].id, "first-step");
    assert.equal(result.steps[0].command, "/some.command");
    assert.equal(result.steps[0].autonomy, "auto");
    assert.equal(result.steps[0].error_policy, "stop");
    assert.deepEqual(result.steps[0].preconditions, []);
    assert.deepEqual(result.steps[0].postconditions, []);
    assert.deepEqual(result.steps[0].escalation_triggers, []);
    assert.equal(result.steps[0].parallel_group, null);
  });

  test("parses full auto-feature playbook", () => {
    const result = parsePlaybook(FULL_PLAYBOOK);

    // Top-level fields
    assert.equal(result.name, "auto-feature");
    assert.equal(result.description, "Full feature workflow from plan to PR");
    assert.equal(result.version, "1.0");

    // Args
    assert.equal(result.args.length, 1);
    assert.equal(result.args[0].name, "feature");
    assert.equal(result.args[0].description, "Feature branch name");
    assert.equal(result.args[0].required, true);

    // Steps count
    assert.equal(result.steps.length, 8);

    // First step
    const plan = result.steps[0];
    assert.equal(plan.id, "plan");
    assert.equal(plan.command, "/speckit.plan");
    assert.equal(plan.args, "");
    assert.equal(plan.autonomy, "auto");
    assert.deepEqual(plan.preconditions, ["spec_exists"]);
    assert.deepEqual(plan.postconditions, ["plan_exists"]);
    assert.equal(plan.error_policy, "stop");
    assert.deepEqual(plan.escalation_triggers, []);

    // Step with {{arg}} interpolation
    const agreement = result.steps[2];
    assert.equal(agreement.id, "agreement");
    assert.equal(agreement.args, "{{feature}}");
    assert.equal(agreement.error_policy, "gate");
    assert.deepEqual(agreement.escalation_triggers, ["subagent_error"]);

    // Step with multiple escalation triggers
    const implement = result.steps[3];
    assert.deepEqual(implement.escalation_triggers, [
      "postcondition_fail",
      "subagent_error",
    ]);
    assert.equal(implement.error_policy, "retry_once");

    // Step with gate_on_breaking autonomy
    const agreementCheck = result.steps[4];
    assert.equal(agreementCheck.autonomy, "gate_on_breaking");
    assert.deepEqual(agreementCheck.preconditions, []);

    // Final step with gate_always
    const pr = result.steps[7];
    assert.equal(pr.id, "pr");
    assert.equal(pr.autonomy, "gate_always");
    assert.deepEqual(pr.postconditions, ["pr_created"]);
  });

  test("handles quoted string values", () => {
    const yaml = `
name: "my-playbook"
description: 'A quoted description'
version: "2.0"

args:
  - name: "env"
    description: "The environment"
    required: false

steps:
  - id: deploy
    command: "/deploy.run"
    args: "{{env}}"
    autonomy: "auto"
    error_policy: "stop"
`;
    const result = parsePlaybook(yaml);
    assert.equal(result.name, "my-playbook");
    assert.equal(result.description, "A quoted description");
    assert.equal(result.version, "2.0");
    assert.equal(result.args[0].name, "env");
    assert.equal(result.args[0].required, false);
    assert.equal(result.steps[0].autonomy, "auto");
  });

  test("handles inline list syntax for preconditions", () => {
    const yaml = `
name: inline-test
description: Testing inline lists
version: 1.0

args: []

steps:
  - id: verify
    command: /verify.run
    autonomy: auto
    preconditions: [spec_exists, plan_exists]
    postconditions: [qa_verdict_pass]
    error_policy: stop
    escalation_triggers: [verdict_fail, subagent_error]
`;
    const result = parsePlaybook(yaml);
    const step = result.steps[0];
    assert.deepEqual(step.preconditions, ["spec_exists", "plan_exists"]);
    assert.deepEqual(step.postconditions, ["qa_verdict_pass"]);
    assert.deepEqual(step.escalation_triggers, ["verdict_fail", "subagent_error"]);
  });

  test("handles multiple args entries", () => {
    const yaml = `
name: multi-arg
description: Multiple arguments
version: 1.0

args:
  - name: feature
    description: Feature name
    required: true
  - name: env
    description: Environment
    required: false
  - name: dry-run
    description: Dry run flag
    required: false

steps:
  - id: step-one
    command: /cmd.run
    autonomy: auto
    error_policy: stop
`;
    const result = parsePlaybook(yaml);
    assert.equal(result.args.length, 3);
    assert.equal(result.args[0].name, "feature");
    assert.equal(result.args[0].required, true);
    assert.equal(result.args[1].name, "env");
    assert.equal(result.args[1].required, false);
    assert.equal(result.args[2].name, "dry-run");
  });

  test("handles comment lines interspersed throughout", () => {
    const yaml = `
# This is a playbook
name: commented
# Another comment
description: Has comments
version: 1.0 # inline comments not parsed

# Args section
args:
  # First arg
  - name: target
    description: Target system
    required: true

# Steps section
steps:
  # First step
  - id: run
    command: /cmd.go
    autonomy: skip
    error_policy: stop
`;
    const result = parsePlaybook(yaml);
    assert.equal(result.name, "commented");
    assert.equal(result.steps[0].autonomy, "skip");
  });

  test("handles parallel_group field", () => {
    const yaml = `
name: parallel-test
description: Tests parallel groups
version: 1.0

args: []

steps:
  - id: step-a
    command: /cmd.a
    autonomy: auto
    error_policy: stop
    parallel_group: phase-1
  - id: step-b
    command: /cmd.b
    autonomy: auto
    error_policy: stop
    parallel_group: phase-1
`;
    const result = parsePlaybook(yaml);
    assert.equal(result.steps[0].parallel_group, "phase-1");
    assert.equal(result.steps[1].parallel_group, "phase-1");
  });

  test("handles all autonomy enum values", () => {
    const autonomyValues = ["auto", "gate_on_breaking", "gate_always", "skip"];
    for (const autonomy of autonomyValues) {
      const yaml = `
name: test
description: Testing autonomy
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: ${autonomy}
    error_policy: stop
`;
      const result = parsePlaybook(yaml);
      assert.equal(result.steps[0].autonomy, autonomy, `autonomy=${autonomy}`);
    }
  });

  test("handles all error_policy enum values", () => {
    const policies = ["stop", "retry_once", "gate"];
    for (const policy of policies) {
      const yaml = `
name: test
description: Testing error_policy
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: ${policy}
`;
      const result = parsePlaybook(yaml);
      assert.equal(result.steps[0].error_policy, policy, `error_policy=${policy}`);
    }
  });

  test("handles all condition enum values in preconditions", () => {
    const conditions = [
      "spec_exists",
      "plan_exists",
      "tasks_exists",
      "agreement_exists",
      "agreement_pass",
      "qa_plan_exists",
      "qa_verdict_pass",
      "pr_created",
    ];
    const yaml = `
name: test
description: All conditions
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
    preconditions:
${conditions.map((c) => `      - ${c}`).join("\n")}
`;
    const result = parsePlaybook(yaml);
    assert.deepEqual(result.steps[0].preconditions, conditions);
  });

  test("handles all escalation_trigger enum values", () => {
    const triggers = [
      "postcondition_fail",
      "verdict_fail",
      "agreement_breaking",
      "subagent_error",
    ];
    const yaml = `
name: test
description: All triggers
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
    escalation_triggers:
${triggers.map((t) => `      - ${t}`).join("\n")}
`;
    const result = parsePlaybook(yaml);
    assert.deepEqual(result.steps[0].escalation_triggers, triggers);
  });

  test("step args field defaults to empty string when absent", () => {
    const yaml = `
name: test
description: No step args
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
`;
    const result = parsePlaybook(yaml);
    assert.equal(result.steps[0].args, "");
  });

  test("optional fields default correctly", () => {
    const yaml = `
name: test
description: Optional fields
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
`;
    const result = parsePlaybook(yaml);
    const step = result.steps[0];
    assert.deepEqual(step.preconditions, []);
    assert.deepEqual(step.postconditions, []);
    assert.deepEqual(step.escalation_triggers, []);
    assert.equal(step.parallel_group, null);
    assert.equal(step.args, "");
  });

  test("step with model: sonnet parses to model: sonnet", () => {
    const yaml = `
name: test
description: Model test
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
    model: "sonnet"
`;
    const result = parsePlaybook(yaml);
    assert.equal(result.steps[0].model, "sonnet");
  });

  test("step without model field parses to model: null", () => {
    const yaml = `
name: test
description: No model
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
`;
    const result = parsePlaybook(yaml);
    assert.equal(result.steps[0].model, null);
  });

  test("all three valid model values parse correctly", () => {
    const models = ["opus", "sonnet", "haiku"];
    for (const model of models) {
      const yaml = `
name: test
description: Testing model
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
    model: ${model}
`;
      const result = parsePlaybook(yaml);
      assert.equal(result.steps[0].model, model, `model=${model}`);
    }
  });

  test("step with model: empty string parses to model: null", () => {
    const yaml = `
name: test
description: Empty model
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
    model: ""
`;
    const result = parsePlaybook(yaml);
    assert.equal(result.steps[0].model, null);
  });

  test("handles Windows CRLF line endings", () => {
    const yaml = "name: win\r\ndescription: Windows line endings\r\nversion: 1.0\r\n\r\nargs: []\r\n\r\nsteps:\r\n  - id: s\r\n    command: /c\r\n    autonomy: auto\r\n    error_policy: stop\r\n";
    const result = parsePlaybook(yaml);
    assert.equal(result.name, "win");
  });

  test("args with required: false", () => {
    const yaml = `
name: test
description: Optional arg
version: 1.0
args:
  - name: opt
    description: Optional
    required: false
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
`;
    const result = parsePlaybook(yaml);
    assert.equal(result.args[0].required, false);
  });
});

// ---------------------------------------------------------------------------
// Error / rejection tests
// ---------------------------------------------------------------------------

describe("parsePlaybook — validation errors", () => {
  test("throws on non-string input", () => {
    assert.throws(() => parsePlaybook(null), /must be a string/);
    assert.throws(() => parsePlaybook(42), /must be a string/);
  });

  test("throws when name is missing", () => {
    const yaml = `
description: No name
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
`;
    assert.throws(() => parsePlaybook(yaml), /missing required top-level field "name"/);
  });

  test("throws when description is missing", () => {
    const yaml = `
name: no-desc
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
`;
    assert.throws(() => parsePlaybook(yaml), /missing required top-level field "description"/);
  });

  test("throws when version is missing", () => {
    const yaml = `
name: no-version
description: Missing version
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
`;
    assert.throws(() => parsePlaybook(yaml), /missing required top-level field "version"/);
  });

  test("throws when steps is empty", () => {
    const yaml = `
name: no-steps
description: No steps
version: 1.0
args: []
steps:
  - id: only-step
    command: /c
    autonomy: auto
    error_policy: stop
`;
    const result = parsePlaybook(yaml);
    assert.equal(result.steps.length, 1); // sanity check — this one is valid

    const emptySteps = `
name: no-steps
description: No steps
version: 1.0
args: []
steps:
`;
    // Empty steps block — no items parsed → should throw
    assert.throws(() => parsePlaybook(emptySteps), /at least one step/);
  });

  test("throws on invalid autonomy value", () => {
    const yaml = `
name: test
description: Bad autonomy
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: always
    error_policy: stop
`;
    assert.throws(() => parsePlaybook(yaml), /autonomy "always" is not valid/);
  });

  test("throws on invalid error_policy value", () => {
    const yaml = `
name: test
description: Bad error_policy
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: ignore
`;
    assert.throws(() => parsePlaybook(yaml), /error_policy "ignore" is not valid/);
  });

  test("throws on invalid precondition value", () => {
    const yaml = `
name: test
description: Bad condition
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
    preconditions:
      - magic_exists
`;
    assert.throws(() => parsePlaybook(yaml), /condition "magic_exists" is not valid/);
  });

  test("throws on invalid escalation_trigger value", () => {
    const yaml = `
name: test
description: Bad trigger
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
    escalation_triggers:
      - unknown_trigger
`;
    assert.throws(() => parsePlaybook(yaml), /escalation_trigger "unknown_trigger" is not valid/);
  });

  test("throws on invalid step id pattern", () => {
    const yaml = `
name: test
description: Bad id
version: 1.0
args: []
steps:
  - id: My_Step
    command: /c
    autonomy: auto
    error_policy: stop
`;
    assert.throws(() => parsePlaybook(yaml), /must match \[a-z0-9-\]\+/);
  });

  test("throws when step is missing required field 'command'", () => {
    const yaml = `
name: test
description: Missing command
version: 1.0
args: []
steps:
  - id: s
    autonomy: auto
    error_policy: stop
`;
    assert.throws(() => parsePlaybook(yaml), /missing required field "command"/);
  });

  test("throws when step is missing required field 'autonomy'", () => {
    const yaml = `
name: test
description: Missing autonomy
version: 1.0
args: []
steps:
  - id: s
    command: /c
    error_policy: stop
`;
    assert.throws(() => parsePlaybook(yaml), /missing required field "autonomy"/);
  });

  test("throws when step is missing required field 'error_policy'", () => {
    const yaml = `
name: test
description: Missing error_policy
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
`;
    assert.throws(() => parsePlaybook(yaml), /missing required field "error_policy"/);
  });

  test("throws when step is missing required field 'id'", () => {
    const yaml = `
name: test
description: Missing id
version: 1.0
args: []
steps:
  - command: /c
    autonomy: auto
    error_policy: stop
`;
    assert.throws(() => parsePlaybook(yaml), /missing required field "id"/);
  });

  test("throws on unknown top-level field", () => {
    const yaml = `
name: test
description: Extra field
version: 1.0
extra_field: oops
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
`;
    assert.throws(() => parsePlaybook(yaml), /unknown top-level field "extra_field"/);
  });

  test("throws on unknown step field", () => {
    const yaml = `
name: test
description: Unknown step field
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
    unknown_field: oops
`;
    assert.throws(() => parsePlaybook(yaml), /unknown step field "unknown_field"/);
  });

  test("throws on unknown arg field", () => {
    const yaml = `
name: test
description: Unknown arg field
version: 1.0
args:
  - name: x
    description: X
    required: true
    extra: bad
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
`;
    assert.throws(() => parsePlaybook(yaml), /unknown arg field "extra"/);
  });

  test("throws on arg required with non-boolean value", () => {
    const yaml = `
name: test
description: Bad required
version: 1.0
args:
  - name: x
    description: X
    required: yes
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
`;
    assert.throws(() => parsePlaybook(yaml), /must be true or false/);
  });

  test("throws on invalid model value", () => {
    const yaml = `
name: test
description: Bad model
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
    model: "invalid-model"
`;
    assert.throws(() => parsePlaybook(yaml), /model "invalid-model" is not valid/);
  });

  test("throws on case-sensitive model value (Sonnet)", () => {
    const yaml = `
name: test
description: Case sensitive model
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
    model: "Sonnet"
`;
    assert.throws(() => parsePlaybook(yaml), /model "Sonnet" is not valid/);
  });

  test("throws on invalid condition in inline list", () => {
    const yaml = `
name: test
description: Bad inline condition
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
    preconditions: [spec_exists, bad_condition]
`;
    assert.throws(() => parsePlaybook(yaml), /condition "bad_condition" is not valid/);
  });

  test("throws on invalid trigger in inline list", () => {
    const yaml = `
name: test
description: Bad inline trigger
version: 1.0
args: []
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
    escalation_triggers: [subagent_error, bad_trigger]
`;
    assert.throws(() => parsePlaybook(yaml), /escalation_trigger "bad_trigger" is not valid/);
  });

  test("throws when arg is missing name", () => {
    const yaml = `
name: test
description: Arg no name
version: 1.0
args:
  - description: No name here
    required: true
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
`;
    assert.throws(() => parsePlaybook(yaml), /missing required field "name"/);
  });

  test("throws when arg is missing description", () => {
    const yaml = `
name: test
description: Arg no desc
version: 1.0
args:
  - name: x
    required: true
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
`;
    assert.throws(() => parsePlaybook(yaml), /missing required field "description"/);
  });

  test("throws when arg is missing required field", () => {
    const yaml = `
name: test
description: Arg no required
version: 1.0
args:
  - name: x
    description: X
steps:
  - id: s
    command: /c
    autonomy: auto
    error_policy: stop
`;
    assert.throws(() => parsePlaybook(yaml), /missing required field "required"/);
  });
});
