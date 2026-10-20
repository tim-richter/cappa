import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  detectCappaRunner,
  detectSkillStacks,
  findIntegrationsDir,
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
});

describe("renderIntegrationFile", () => {
  it("fills every runner placeholder", () => {
    expect(
      renderIntegrationFile("{{cappa}} a; {{cappa}} b", "pnpm exec cappa"),
    ).toBe("pnpm exec cappa a; pnpm exec cappa b");
  });
});

describe("installAgentSkills", () => {
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
    });
    expect(result.warnings).toEqual([
      expect.stringContaining("OpenCode reads .claude/skills too"),
    ]);
  });
});
