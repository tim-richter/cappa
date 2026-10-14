import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/**
 * Agent integrations `cappa agent init` can install, and the files each one
 * gets.
 *
 * - `claude` — Claude Code: the skill in `.claude/skills/cappa`.
 * - `agents` — the vendor-neutral Agent Skills directory `.agents/skills`,
 *   read by Codex, OpenCode and other agents that adopted it.
 * - `opencode` — OpenCode: the `.agents` skill plus slash commands that run
 *   the review flow and a sandboxed `cappa-judge` subagent that judges
 *   screenshots in its own context.
 *
 * Sources are relative to the package's `integrations/` directory; targets
 * are relative to the project.
 */
const SKILL = [
  "skills/cappa/SKILL.md",
  "skills/cappa/JUDGING.md",
  "skills/cappa/MASKING.md",
] as const;

type FileMapping = { source: string; target: string };

const skillInto = (dir: string): FileMapping[] =>
  SKILL.map((source) => ({
    source,
    target: path.join(dir, path.basename(source)),
  }));

export const STACK_FILES = {
  claude: skillInto(".claude/skills/cappa"),
  agents: skillInto(".agents/skills/cappa"),
  opencode: [
    ...skillInto(".agents/skills/cappa"),
    ...[
      "commands/cappa-review.md",
      "commands/cappa-judge.md",
      "commands/cappa-approve.md",
      "agents/cappa-judge.md",
    ].map((file) => ({
      source: `opencode/${file}`,
      target: path.join(".opencode", file),
    })),
  ],
} satisfies Record<string, FileMapping[]>;

export type SkillStack = keyof typeof STACK_FILES;

export const SKILL_STACK_NAMES = Object.keys(STACK_FILES) as SkillStack[];

/**
 * Find the integration sources shipped with the package.
 *
 * They live in `integrations/` at the package root, which is one level above
 * `dist/` when installed and two above `src/utils/` in development — so walk
 * up instead of hard-coding either depth.
 */
export const findIntegrationsDir = (from: string = __dirname): string => {
  let current = from;
  while (true) {
    const candidate = path.join(current, "integrations");
    if (fs.existsSync(path.join(candidate, "skills", "cappa", "SKILL.md"))) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Could not locate the bundled cappa agent skill files");
    }
    current = parent;
  }
};

/**
 * Pick the stacks to install when none was named: whichever agents the
 * project already shows signs of, falling back to Claude Code.
 *
 * OpenCode wins over plain `agents` — its stack already includes the
 * `.agents` skill, and adds the commands on top.
 */
export const detectSkillStacks = (cwd: string): SkillStack[] => {
  const has = (entry: string) => fs.existsSync(path.join(cwd, entry));
  const stacks: SkillStack[] = [];
  if (has(".claude") || has("CLAUDE.md")) stacks.push("claude");
  if (has(".opencode") || has("opencode.json") || has("opencode.jsonc")) {
    stacks.push("opencode");
  } else if (has(".agents") || has("AGENTS.md")) {
    stacks.push("agents");
  }
  return stacks.length > 0 ? stacks : ["claude"];
};

/**
 * How the project runs its own `cappa` binary, from its lockfile.
 *
 * Written into the installed files because OpenCode commands run shell
 * commands *before* the model sees anything, so a bare `cappa` that is not on
 * `PATH` would inject an error instead of the review state; and agent
 * permission rules match the command text literally.
 */
export const detectCappaRunner = (cwd: string): string => {
  const has = (entry: string) => fs.existsSync(path.join(cwd, entry));
  if (has("pnpm-lock.yaml")) return "pnpm exec cappa";
  if (has("yarn.lock")) return "yarn cappa";
  if (has("bun.lock") || has("bun.lockb")) return "bunx cappa";
  return "npx cappa";
};

/** Fill the `{{cappa}}` placeholder in a source file. */
export const renderIntegrationFile = (source: string, runner: string) =>
  source.replaceAll("{{cappa}}", runner);

export type SkillFileResult = {
  stack: SkillStack;
  path: string;
  status: "written" | "unchanged" | "skipped";
};

export type InstallResult = {
  runner: string;
  files: SkillFileResult[];
  warnings: string[];
};

/**
 * Copy each stack's files into the project.
 *
 * A file that exists with different content is left alone unless `force` is
 * set: users are expected to tailor these to their project, and an upgrade
 * must not silently discard that. A target shared by two stacks (the
 * `.agents` skill) is written once.
 */
export const installAgentSkills = async (options: {
  cwd: string;
  stacks: readonly SkillStack[];
  force?: boolean;
  runner?: string;
  sourceDir?: string;
}): Promise<InstallResult> => {
  const sourceDir = options.sourceDir ?? findIntegrationsDir();
  const runner = options.runner ?? detectCappaRunner(options.cwd);
  const files: SkillFileResult[] = [];
  const seen = new Set<string>();

  for (const stack of options.stacks) {
    for (const mapping of STACK_FILES[stack]) {
      const target = path.resolve(options.cwd, mapping.target);
      if (seen.has(target)) continue;
      seen.add(target);

      const source = renderIntegrationFile(
        await fsp.readFile(path.join(sourceDir, mapping.source), "utf8"),
        runner,
      );
      const existing = await fsp
        .readFile(target, "utf8")
        .catch(() => undefined);

      if (existing === source) {
        files.push({ stack, path: target, status: "unchanged" });
        continue;
      }
      if (existing !== undefined && !options.force) {
        files.push({ stack, path: target, status: "skipped" });
        continue;
      }

      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, source, "utf8");
      files.push({ stack, path: target, status: "written" });
    }
  }

  const warnings: string[] = [];
  const claudeSkill = fs.existsSync(
    path.resolve(options.cwd, ".claude/skills/cappa/SKILL.md"),
  );
  if (options.stacks.includes("opencode") && claudeSkill) {
    warnings.push(
      "OpenCode reads .claude/skills too, and uses that copy of the cappa skill over the one in .agents/skills — keep the two in sync if you tailor them.",
    );
  }

  return { runner, files, warnings };
};
