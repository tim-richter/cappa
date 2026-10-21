import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/**
 * Agent integrations `cappa agent init` can install, and the files each one
 * gets.
 *
 * - `claude` — Claude Code: the skill in `.claude/skills/cappa` plus a
 *   `cappa-judge` subagent that judges screenshots in its own context.
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
  claude: [
    ...skillInto(".claude/skills/cappa"),
    {
      source: "claude/agents/cappa-judge.md",
      target: path.join(".claude", "agents", "cappa-judge.md"),
    },
  ],
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

const LOCKFILES = {
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "bun.lock": "bun",
  "bun.lockb": "bun",
  "package-lock.json": "npm",
} as const;

type PackageManager = (typeof LOCKFILES)[keyof typeof LOCKFILES];

const detectPackageManager = (dir: string): PackageManager | undefined => {
  for (const [lockfile, manager] of Object.entries(LOCKFILES)) {
    if (fs.existsSync(path.join(dir, lockfile))) return manager;
  }
  return undefined;
};

/**
 * The directory agents work from: the workspace root holding the lockfile.
 *
 * `cappa` is often installed in a single workspace package and run with
 * `pnpm -F <pkg> exec cappa`, which puts `cwd` inside that package — but
 * agents only read `.claude/` and `.agents/` from the root they were started
 * in. Walk up to the nearest lockfile or `pnpm-workspace.yaml`, without
 * leaving the git repository; `cwd` itself when there is neither.
 */
export const findProjectRoot = (cwd: string): string => {
  let current = path.resolve(cwd);
  while (true) {
    const has = (entry: string) => fs.existsSync(path.join(current, entry));
    if (detectPackageManager(current) || has("pnpm-workspace.yaml")) {
      return current;
    }
    const parent = path.dirname(current);
    if (has(".git") || parent === current) return path.resolve(cwd);
    current = parent;
  }
};

const readPackageName = (dir: string): string | undefined => {
  try {
    const { name } = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf8"),
    );
    return typeof name === "string" ? name : undefined;
  } catch {
    return undefined;
  }
};

/**
 * How the project runs its own `cappa` binary, from its lockfile.
 *
 * Written into the installed files because OpenCode commands run shell
 * commands *before* the model sees anything, so a bare `cappa` that is not on
 * `PATH` would inject an error instead of the review state; and agent
 * permission rules match the command text literally.
 *
 * When `cwd` is a package below `root`, the command switches into it: that is
 * where `cappa` is installed and where `cappa.config.ts` lives, while agents
 * run commands from the root.
 */
export const detectCappaRunner = (root: string, cwd: string = root): string => {
  const manager = detectPackageManager(root);
  const dir = path.relative(root, cwd).split(path.sep).join("/");

  if (!dir) {
    return {
      pnpm: "pnpm exec cappa",
      yarn: "yarn cappa",
      bun: "bunx cappa",
      npm: "npx cappa",
    }[manager ?? "npm"];
  }

  switch (manager) {
    case "pnpm":
      return `pnpm -C ${dir} exec cappa`;
    case "yarn": {
      const name = readPackageName(cwd);
      return name ? `yarn workspace ${name} cappa` : `yarn --cwd ${dir} cappa`;
    }
    case "bun":
      return `bun --cwd ${dir} x cappa`;
    default:
      return `npm exec -w ${dir} -- cappa`;
  }
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
  root: string;
  runner: string;
  files: SkillFileResult[];
  warnings: string[];
};

/**
 * Copy each stack's files into the project root (see `findProjectRoot`).
 *
 * A file that exists with different content is left alone unless `force` is
 * set: users are expected to tailor these to their project, and an upgrade
 * must not silently discard that. A target shared by two stacks (the
 * `.agents` skill) is written once.
 */
export const installAgentSkills = async (options: {
  cwd: string;
  root?: string;
  stacks: readonly SkillStack[];
  force?: boolean;
  runner?: string;
  sourceDir?: string;
}): Promise<InstallResult> => {
  const sourceDir = options.sourceDir ?? findIntegrationsDir();
  const root = options.root ?? findProjectRoot(options.cwd);
  const runner = options.runner ?? detectCappaRunner(root, options.cwd);
  const files: SkillFileResult[] = [];
  const seen = new Set<string>();

  for (const stack of options.stacks) {
    for (const mapping of STACK_FILES[stack]) {
      const target = path.resolve(root, mapping.target);
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
    path.resolve(root, ".claude/skills/cappa/SKILL.md"),
  );
  if (options.stacks.includes("opencode") && claudeSkill) {
    warnings.push(
      "OpenCode reads .claude/skills too, and uses that copy of the cappa skill over the one in .agents/skills — keep the two in sync if you tailor them.",
    );
  }

  return { root, runner, files, warnings };
};
