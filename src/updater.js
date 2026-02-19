import {
  existsSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(__dirname, "..", "templates");

function copyTemplate(src, dest) {
  const destDir = dirname(dest);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }
  copyFileSync(src, dest);
}

export function update(flags = []) {
  const projectRoot = process.cwd();

  console.log("\n  playbook update\n");

  if (!existsSync(join(projectRoot, ".playbooks"))) {
    console.error(
      "  Error: .playbooks/ not found. Run `npx @tcanaud/playbook init` first."
    );
    process.exit(1);
  }

  // Overwrite built-in playbooks
  console.log("  Updating built-in playbooks...");

  const playbookMappings = [
    ["playbooks/auto-feature.yaml", ".playbooks/playbooks/auto-feature.yaml"],
    ["playbooks/auto-validate.yaml", ".playbooks/playbooks/auto-validate.yaml"],
    ["core/playbook.tpl.yaml", ".playbooks/playbooks/playbook.tpl.yaml"],
  ];

  for (const [src, dest] of playbookMappings) {
    const srcPath = join(TEMPLATES, src);
    if (existsSync(srcPath)) {
      copyTemplate(srcPath, join(projectRoot, dest));
      console.log(`    updated ${dest}`);
    }
  }

  // Regenerate _index.yaml
  console.log("\n  Regenerating _index.yaml...");

  const indexTemplatePath = join(TEMPLATES, "core/_index.yaml");
  if (existsSync(indexTemplatePath)) {
    const timestamp = new Date().toISOString();
    const content = readFileSync(indexTemplatePath, "utf8").replace(
      "{{TIMESTAMP}}",
      timestamp
    );
    const indexDest = join(projectRoot, ".playbooks/_index.yaml");
    writeFileSync(indexDest, content, "utf8");
    console.log(`    updated .playbooks/_index.yaml`);
  }

  // Overwrite slash command files
  console.log("\n  Updating Claude Code commands...");

  const commandMappings = [
    ["commands/playbook.run.md", ".claude/commands/playbook.run.md"],
    ["commands/playbook.resume.md", ".claude/commands/playbook.resume.md"],
  ];

  for (const [src, dest] of commandMappings) {
    const srcPath = join(TEMPLATES, src);
    if (existsSync(srcPath)) {
      copyTemplate(srcPath, join(projectRoot, dest));
      console.log(`    updated ${dest}`);
    }
  }

  console.log();
  console.log("  Done! Playbooks and commands updated.");
  console.log("  Your .playbooks/sessions/ data is untouched.\n");
}
