import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  detectCappaRunner,
  detectSkillStacks,
  findIntegrationsDir,
  findProjectRoot,
  installAgentSkills,
  renderIntegrationFile,
  STACK_FILES,
} from "./agentSkills";

let cwd: string;

beforeEach(async () => {
  cwd = await fsp.mkdtemp(path.join(os.tmpdir(), "cappa-skills-"));
});

afterEach(async () => {
  await fsp.rm(cwd, { recursive: true, force: true });
});

const read = (relative: string) =>
  fsp.readFile(path.join(cwd, relative), "utf8");

describe("findIntegrationsDir", () => {
  it("finds every file a stack installs", async () => {
    const dir = findIntegrationsDir();
    for (const mapping of Object.values(STACK_FILES).flat()) {
      await expect(
        fsp.access(path.join(dir, mapping.source)),
      ).resolves.toBeUndefined();
    }
  });

  it("throws when there are no integrations above the start directory", () => {
    expect(() => findIntegrationsDir(os.tmpdir())).toThrow(/Could not locate/);
  });
});

describe("detectSkillStacks", () => {
  it("falls back to claude", () => {
    expect(detectSkillStacks(cwd)).toEqual(["claude"]);
  });

  it("detects AGENTS.md", async () => {
    await fsp.writeFile(path.join(cwd, "AGENTS.md"), "");
    expect(detectSkillStacks(cwd)).toEqual(["agents"]);
  });

  it("prefers opencode over plain agents, since it includes the .agents skill", async () => {
    await fsp.writeFile(path.join(cwd, "AGENTS.md"), "");
    await fsp.writeFile(path.join(cwd, "opencode.json"), "{}");
    expect(detectSkillStacks(cwd)).toEqual(["opencode"]);
  });

  it("detects claude alongside opencode", async () => {
    await fsp.mkdir(path.join(cwd, ".claude"));
    await fsp.mkdir(path.join(cwd, ".opencode"));
    expect(detectSkillStacks(cwd)).toEqual(["claude", "opencode"]);
  });
});

describe("detectCappaRunner", () => {
  it.each([
    ["pnpm-lock.yaml", "pnpm exec cappa"],
    ["yarn.lock", "yarn cappa"],
    ["bun.lock", "bunx cappa"],
    ["package-lock.json", "npx cappa"],
  ])("reads %s", async (lockfile, runner) => {
    await fsp.writeFile(path.join(cwd, lockfile), "");
    expect(detectCappaRunner(cwd)).toBe(runner);
  });

  it("falls back to npx", () => {
    expect(detectCappaRunner(cwd)).toBe("npx cappa");
  });

  it.each([
    ["pnpm-lock.yaml", "pnpm -C packages/web exec cappa"],
    ["yarn.lock", "yarn workspace @acme/web cappa"],
    ["bun.lock", "bun --cwd packages/web x cappa"],
    ["package-lock.json", "npm exec -w packages/web -- cappa"],
  ])("switches into a workspace package with %s", async (lockfile, runner) => {
    const pkg = path.join(cwd, "packages", "web");
    await fsp.mkdir(pkg, { recursive: true });
    await fsp.writeFile(path.join(cwd, lockfile), "");
    await fsp.writeFile(
      path.join(pkg, "package.json"),
      JSON.stringify({ name: "@acme/web" }),
    );
    expect(detectCappaRunner(cwd, pkg)).toBe(runner);
  });
});

describe("findProjectRoot", () => {
  it("walks up from a workspace package to the lockfile", async () => {
    const pkg = path.join(cwd, "packages", "web");
    await fsp.mkdir(pkg, { recursive: true });
    await fsp.writeFile(path.join(cwd, "pnpm-lock.yaml"), "");
    expect(findProjectRoot(pkg)).toBe(cwd);
  });

  it("stops at a lockfile in cwd", async () => {
    await fsp.writeFile(path.join(cwd, "pnpm-lock.yaml"), "");
    expect(findProjectRoot(cwd)).toBe(cwd);
  });

  it("does not leave the git repository", async () => {
    const repo = path.join(cwd, "repo");
    const pkg = path.join(repo, "packages", "web");
    await fsp.mkdir(pkg, { recursive: true });
    await fsp.mkdir(path.join(repo, ".git"));
    await fsp.writeFile(path.join(cwd, "pnpm-lock.yaml"), "");
    expect(findProjectRoot(pkg)).toBe(pkg);
  });
});

describe("renderIntegrationFile", () => {
  it("fills every runner placeholder", () => {
    expect(
      renderIntegrationFile("{{cappa}} a; {{cappa}} b", "pnpm exec cappa"),
    ).toBe("pnpm exec cappa a; pnpm exec cappa b");
  });
});

describe("installAgentSkills", () => {
  it("installs at the workspace root when run from a package", async () => {
    const pkg = path.join(cwd, "packages", "web");
    await fsp.mkdir(pkg, { recursive: true });
    await fsp.writeFile(path.join(cwd, "pnpm-lock.yaml"), "");

    const result = await installAgentSkills({ cwd: pkg, stacks: ["claude"] });

    expect(result.root).toBe(cwd);
    expect(result.runner).toBe("pnpm -C packages/web exec cappa");
    expect(await read(".claude/skills/cappa/SKILL.md")).toContain(
      "`pnpm -C packages/web exec cappa`",
    );
    expect(fs.existsSync(path.join(pkg, ".claude"))).toBe(false);
  });

  it("writes, then leaves identical files alone", async () => {
    const first = await installAgentSkills({ cwd, stacks: ["claude"] });
    expect(first.files.map((r) => path.relative(cwd, r.path))).toEqual([
      ".claude/skills/cappa/SKILL.md",
      ".claude/skills/cappa/JUDGING.md",
      ".claude/skills/cappa/MASKING.md",
      ".claude/agents/cappa-judge.md",
    ]);
    expect(first.files.every((r) => r.status === "written")).toBe(true);
    expect(await read(".claude/agents/cappa-judge.md")).toContain(
      "`npx cappa agent judge`",
    );

    const second = await installAgentSkills({ cwd, stacks: ["claude"] });
    expect(second.files.every((r) => r.status === "unchanged")).toBe(true);
  });

  it("keeps modified files unless forced", async () => {
    await installAgentSkills({ cwd, stacks: ["agents"] });
    const skill = path.join(cwd, ".agents/skills/cappa/SKILL.md");
    await fsp.writeFile(skill, "tailored");

    const kept = await installAgentSkills({ cwd, stacks: ["agents"] });
    expect(kept.files[0]?.status).toBe("skipped");
    expect(await fsp.readFile(skill, "utf8")).toBe("tailored");

    const forced = await installAgentSkills({
      cwd,
      stacks: ["agents"],
      force: true,
    });
    expect(forced.files[0]?.status).toBe("written");
  });

  it("installs the opencode commands and judge with the project's runner", async () => {
    await fsp.writeFile(path.join(cwd, "pnpm-lock.yaml"), "");

    const result = await installAgentSkills({ cwd, stacks: ["opencode"] });

    expect(result.runner).toBe("pnpm exec cappa");
    expect(result.files.map((f) => path.relative(cwd, f.path))).toEqual([
      ".agents/skills/cappa/SKILL.md",
      ".agents/skills/cappa/JUDGING.md",
      ".agents/skills/cappa/MASKING.md",
      ".opencode/commands/cappa-review.md",
      ".opencode/commands/cappa-judge.md",
      ".opencode/commands/cappa-approve.md",
      ".opencode/agents/cappa-judge.md",
    ]);

    const judge = await read(".opencode/agents/cappa-judge.md");
    expect(judge).toContain('"pnpm exec cappa agent judge*": allow');
    expect(judge).not.toContain("{{cappa}}");
    expect(await read(".opencode/commands/cappa-review.md")).toContain(
      "!`pnpm exec cappa agent check --json || true`",
    );
    expect(await read(".agents/skills/cappa/SKILL.md")).toContain(
      "Run the CLI as `pnpm exec cappa`",
    );
  });

  it("writes the shared .agents skill once for agents + opencode", async () => {
    const result = await installAgentSkills({
      cwd,
      stacks: ["agents", "opencode"],
      runner: "npx cappa",
    });
    const skills = result.files.filter((f) =>
      f.path.endsWith(path.join(".agents/skills/cappa/SKILL.md")),
    );
    expect(skills).toHaveLength(1);
  });

  it("warns that opencode sees a .claude copy of the skill too", async () => {
    const result = await installAgentSkills({
      cwd,
      stacks: ["claude", "opencode"],
      judgeModel: "openai/gpt-5",
    });
    expect(result.warnings).toEqual([
      expect.stringContaining("OpenCode reads .claude/skills too"),
    ]);
  });

  it("warns that the opencode judge runs on the calling model", async () => {
    const result = await installAgentSkills({ cwd, stacks: ["opencode"] });
    expect(result.judgeModels).toEqual({});
    expect(result.warnings).toEqual([
      expect.stringContaining("--judge-model <provider/model>"),
    ]);
    expect(await read(".opencode/agents/cappa-judge.md")).not.toMatch(
      /^---\nmodel:/,
    );
  });

  it("pins the judge whose format the model matches", async () => {
    const result = await installAgentSkills({
      cwd,
      stacks: ["claude", "opencode"],
      judgeModel: "openai/gpt-5",
    });

    expect(result.judgeModels).toEqual({ opencode: "openai/gpt-5" });
    expect(result.warnings.some((w) => w.includes("--judge-model"))).toBe(
      false,
    );
    const judge = await read(".opencode/agents/cappa-judge.md");
    expect(judge.startsWith("---\nmodel: openai/gpt-5\ndescription:")).toBe(
      true,
    );
    expect(await read(".claude/agents/cappa-judge.md")).not.toMatch(
      /^---\nmodel:/,
    );
  });

  it("pins the claude judge to an alias", async () => {
    const result = await installAgentSkills({
      cwd,
      stacks: ["claude"],
      judgeModel: "sonnet",
    });
    expect(result.judgeModels).toEqual({ claude: "sonnet" });
    expect(await read(".claude/agents/cappa-judge.md")).toMatch(
      /^---\nmodel: sonnet\nname: cappa-judge\n/,
    );
  });

  it("rejects a model no installed judge can take", async () => {
    await expect(
      installAgentSkills({ cwd, stacks: ["opencode"], judgeModel: "sonnet" }),
    ).rejects.toThrow("provider/model");
    await expect(
      installAgentSkills({ cwd, stacks: ["agents"], judgeModel: "a/b" }),
    ).rejects.toThrow("--stack opencode");
  });

  it("re-pins a judge without --force, and keeps its pin when re-run", async () => {
    await installAgentSkills({ cwd, stacks: ["opencode"] });

    const pinned = await installAgentSkills({
      cwd,
      stacks: ["opencode"],
      judgeModel: "anthropic/claude-sonnet-5-5",
    });
    const judge = (r: typeof pinned) =>
      r.files.find(
        (f) => f.path.endsWith("cappa-judge.md") && f.path.includes("agents"),
      );
    expect(judge(pinned)?.status).toBe("written");

    const rerun = await installAgentSkills({ cwd, stacks: ["opencode"] });
    expect(judge(rerun)?.status).toBe("unchanged");
    expect(rerun.judgeModels).toEqual({
      opencode: "anthropic/claude-sonnet-5-5",
    });
    expect(await read(".opencode/agents/cappa-judge.md")).toContain(
      "model: anthropic/claude-sonnet-5-5",
    );
  });

  it("does not re-pin a judge the user edited", async () => {
    await installAgentSkills({ cwd, stacks: ["claude"] });
    const target = path.join(cwd, ".claude/agents/cappa-judge.md");
    await fsp.appendFile(target, "\ntailored\n");

    const result = await installAgentSkills({
      cwd,
      stacks: ["claude"],
      judgeModel: "opus",
    });
    expect(result.files.at(-1)?.status).toBe("skipped");
    expect(await fsp.readFile(target, "utf8")).not.toMatch(/^---\nmodel:/);
  });

  it("points the opencode judge at the .agents skill", async () => {
    await installAgentSkills({ cwd, stacks: ["opencode"] });
    expect(await read(".opencode/agents/cappa-judge.md")).toContain(
      "Follow `.agents/skills/cappa/JUDGING.md`:",
    );
  });

  it("points both judges at the .claude skill when OpenCode would read it", async () => {
    await installAgentSkills({ cwd, stacks: ["claude", "opencode"] });
    for (const [judge, skill] of [
      [".claude/agents/cappa-judge.md", ".claude/skills/cappa/JUDGING.md"],
      [".opencode/agents/cappa-judge.md", ".claude/skills/cappa/JUDGING.md"],
    ] as const) {
      const text = await read(judge);
      expect(text).toContain(`Follow \`${skill}\`:`);
      expect(text).not.toContain("{{");
      expect(text).toContain("cannot read images");
      expect(fs.existsSync(path.join(cwd, skill))).toBe(true);
    }
  });

  it("guards the claude judge's Bash with the project's runner", async () => {
    await fsp.writeFile(path.join(cwd, "pnpm-lock.yaml"), "");
    await installAgentSkills({ cwd, stacks: ["claude"] });
    const judge = await read(".claude/agents/cappa-judge.md");
    expect(judge).toContain(
      `command: 'pnpm exec cappa agent guard --runner "pnpm exec cappa"'`,
    );
    expect(judge).toContain('- matcher: "Bash"');
  });

  it("does not tell a blind judge to --force the install", async () => {
    await installAgentSkills({ cwd, stacks: ["claude", "opencode"] });
    for (const judge of [
      ".claude/agents/cappa-judge.md",
      ".opencode/agents/cappa-judge.md",
    ]) {
      const text = await read(judge);
      expect(text).toContain("agent init --judge-model <model>`");
      expect(text).not.toContain("--force");
    }
  });
});
