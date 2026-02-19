import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { detectPlaybooksDir, detectClaudeCommands } from "./detect.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(__dirname, "..", "templates");

// ── Helpers ──────────────────────────────────────────────

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function copyTemplate(src, dest) {
  ensureDir(dirname(dest));
  copyFileSync(src, dest);
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ── install ──────────────────────────────────────────────

export async function install(flags = []) {
  const projectRoot = process.cwd();
  const autoYes = flags.includes("--yes");

  console.log("\n  @tcanaud/playbook v1.0.0\n");

  const playbooksDir = join(projectRoot, ".playbooks");
  const alreadyExists = existsSync(playbooksDir);

  // ── Confirmation prompt ──────────────────────────────
  if (alreadyExists && !autoYes) {
    const answer = await ask(
      "  Playbook system already initialized. Re-install? (y/N) "
    );
    if (answer !== "y" && answer !== "yes") {
      console.log("  Skipping. Use '@tcanaud/playbook update' to refresh commands only.\n");
      return;
    }
  }

  // ── Phase 1/3: Create .playbooks/ directory tree ─────
  console.log("  [1/3] Creating .playbooks/ directory tree...");

  const dirs = [
    join(playbooksDir, "playbooks"),
    join(playbooksDir, "sessions"),
    join(playbooksDir, "templates"),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      const rel = dir.replace(projectRoot + "/", "");
      console.log(`    created .${rel.startsWith(".") ? "" : "/"}${rel}`);
    }
  }

  // ── Phase 2/3: Copy built-in playbook files ──────────
  console.log("  [2/3] Installing built-in playbooks...");

  const playbookFiles = ["auto-feature.yaml", "auto-validate.yaml"];

  for (const file of playbookFiles) {
    const src = join(TEMPLATES, "playbooks", file);
    const dest = join(playbooksDir, "playbooks", file);
    if (existsSync(src)) {
      copyTemplate(src, dest);
      console.log(`    created .playbooks/playbooks/${file}`);
    }
  }

  // Copy playbook template file
  const tplSrc = join(TEMPLATES, "core", "playbook.tpl.yaml");
  const tplDest = join(playbooksDir, "playbooks", "playbook.tpl.yaml");
  if (existsSync(tplSrc)) {
    copyTemplate(tplSrc, tplDest);
    console.log("    created .playbooks/playbooks/playbook.tpl.yaml");
  }

  // Generate _index.yaml from template (replace {{TIMESTAMP}})
  const indexSrc = join(TEMPLATES, "core", "_index.yaml");
  const indexDest = join(playbooksDir, "_index.yaml");
  if (existsSync(indexSrc)) {
    const timestamp = new Date().toISOString();
    const content = readFileSync(indexSrc, "utf8").replace(
      /\{\{TIMESTAMP\}\}/g,
      timestamp
    );
    writeFileSync(indexDest, content, "utf8");
    console.log("    created .playbooks/_index.yaml");
  }

  // ── Phase 3/3: Install Claude Code commands ──────────
  console.log("  [3/3] Installing Claude Code commands...");

  const claudeCommandsDir = join(projectRoot, ".claude", "commands");
  if (!detectClaudeCommands(projectRoot)) {
    mkdirSync(claudeCommandsDir, { recursive: true });
    console.log("    created .claude/commands/");
  }

  const commandFiles = ["playbook.run.md", "playbook.resume.md", "playbook.create.md"];

  for (const file of commandFiles) {
    const src = join(TEMPLATES, "commands", file);
    const dest = join(claudeCommandsDir, file);
    if (existsSync(src)) {
      copyTemplate(src, dest);
      console.log(`    created .claude/commands/${file}`);
    }
  }

  // ── Done ─────────────────────────────────────────────
  console.log();
  console.log("  Done! Playbook system installed.");
  console.log();
  console.log("  Next steps:");
  console.log("    1. Run /playbook.run {playbook} {feature} to start a supervised workflow");
  console.log("    2. Run /playbook.resume to recover an interrupted session");
  console.log("    3. Explore .playbooks/playbooks/ to see built-in playbooks");
  console.log();
}
