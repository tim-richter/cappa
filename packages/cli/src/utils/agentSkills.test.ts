import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  detectSkillStacks,
  findSkillSourceDir,
  installAgentSkills,
  SKILL_FILES,
} from "./agentSkills";

let cwd: string;

beforeEach(async () => {
  cwd = await fsp.mkdtemp(path.join(os.tmpdir(), "cappa-skills-"));
});

afterEach(async () => {
  await fsp.rm(cwd, { recursive: true, force: true });
});

describe("findSkillSourceDir", () => {
  it("finds the skill shipped with the package", async () => {
    const dir = findSkillSourceDir();
    const skill = await fsp.readFile(path.join(dir, "SKILL.md"), "utf8");
    expect(skill).toMatch(/^---\nname: cappa\n/);
    for (const file of SKILL_FILES) {
      await expect(fsp.access(path.join(dir, file))).resolves.toBeUndefined();
    }
  });

  it("throws when there is no skill above the start directory", () => {
    expect(() => findSkillSourceDir(os.tmpdir())).toThrow(/Could not locate/);
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

  it("detects both", async () => {
    await fsp.mkdir(path.join(cwd, ".claude"));
    await fsp.mkdir(path.join(cwd, ".agents"));
    expect(detectSkillStacks(cwd)).toEqual(["claude", "agents"]);
  });
});

describe("installAgentSkills", () => {
  it("writes, then leaves identical files alone", async () => {
    const first = await installAgentSkills({ cwd, stacks: ["claude"] });
    expect(first.map((r) => r.status)).toEqual([
      "written",
      "written",
      "written",
    ]);
    expect(first[0]?.path).toBe(
      path.join(cwd, ".claude/skills/cappa/SKILL.md"),
    );

    const second = await installAgentSkills({ cwd, stacks: ["claude"] });
    expect(second.every((r) => r.status === "unchanged")).toBe(true);
  });

  it("keeps modified files unless forced", async () => {
    await installAgentSkills({ cwd, stacks: ["agents"] });
    const skill = path.join(cwd, ".agents/skills/cappa/SKILL.md");
    await fsp.writeFile(skill, "tailored");

    const kept = await installAgentSkills({ cwd, stacks: ["agents"] });
    expect(kept[0]?.status).toBe("skipped");
    expect(await fsp.readFile(skill, "utf8")).toBe("tailored");

    const forced = await installAgentSkills({
      cwd,
      stacks: ["agents"],
      force: true,
    });
    expect(forced[0]?.status).toBe("written");
    expect(await fsp.readFile(skill, "utf8")).not.toBe("tailored");
  });
});
