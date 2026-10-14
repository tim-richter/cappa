import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/**
 * Where each coding agent looks for project skills.
 *
 * `claude` is Claude Code. `agents` is the vendor-neutral `.agents/skills`
 * directory of the Agent Skills format, read by Codex and other agents that
 * adopted it.
 */
export const SKILL_STACKS = {
  claude: ".claude/skills/cappa",
  agents: ".agents/skills/cappa",
} as const;

export type SkillStack = keyof typeof SKILL_STACKS;

export const SKILL_STACK_NAMES = Object.keys(SKILL_STACKS) as SkillStack[];

export const SKILL_FILES = ["SKILL.md", "JUDGING.md", "MASKING.md"] as const;

/**
 * Find the skill sources shipped with the package.
 *
 * They live in `skills/` at the package root, which is one level above
 * `dist/` when installed and two above `src/utils/` in development — so walk
 * up instead of hard-coding either depth.
 */
export const findSkillSourceDir = (from: string = __dirname): string => {
  let current = from;
  while (true) {
    const candidate = path.join(current, "skills", "cappa");
    if (fs.existsSync(path.join(candidate, "SKILL.md"))) return candidate;
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Could not locate the bundled cappa agent skill files");
    }
    current = parent;
  }
};

/**
 * Pick the stacks to install for when none was named: whichever agents the
 * project already shows signs of, falling back to Claude Code.
 */
export const detectSkillStacks = (cwd: string): SkillStack[] => {
  const has = (entry: string) => fs.existsSync(path.join(cwd, entry));
  const stacks: SkillStack[] = [];
  if (has(".claude") || has("CLAUDE.md")) stacks.push("claude");
  if (has(".agents") || has("AGENTS.md")) stacks.push("agents");
  return stacks.length > 0 ? stacks : ["claude"];
};

export type SkillFileResult = {
  stack: SkillStack;
  path: string;
  status: "written" | "unchanged" | "skipped";
};

/**
 * Copy the skill into each stack's directory.
 *
 * A file that exists with different content is left alone unless `force` is
 * set: users are expected to tailor the skill to their project, and an
 * upgrade must not silently discard that.
 */
export const installAgentSkills = async (options: {
  cwd: string;
  stacks: readonly SkillStack[];
  force?: boolean;
  sourceDir?: string;
}): Promise<SkillFileResult[]> => {
  const sourceDir = options.sourceDir ?? findSkillSourceDir();
  const results: SkillFileResult[] = [];

  for (const stack of options.stacks) {
    const targetDir = path.resolve(options.cwd, SKILL_STACKS[stack]);
    await fsp.mkdir(targetDir, { recursive: true });

    for (const file of SKILL_FILES) {
      const source = await fsp.readFile(path.join(sourceDir, file), "utf8");
      const target = path.join(targetDir, file);
      const existing = await fsp
        .readFile(target, "utf8")
        .catch(() => undefined);

      if (existing === source) {
        results.push({ stack, path: target, status: "unchanged" });
        continue;
      }
      if (existing !== undefined && !options.force) {
        results.push({ stack, path: target, status: "skipped" });
        continue;
      }

      await fsp.writeFile(target, source, "utf8");
      results.push({ stack, path: target, status: "written" });
    }
  }

  return results;
};
