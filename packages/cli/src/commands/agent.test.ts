import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { AgentReport } from "@cappa/core";
import sharp from "sharp";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";

const { getConfigMock } = vi.hoisted(() => ({ getConfigMock: vi.fn() }));

vi.mock("@cappa/config", () => ({ getConfig: getConfigMock }));

vi.mock("@cappa/logger", () => {
  const logger = {
    box: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  };
  return { getLogger: () => logger };
});

import {
  agentApprove,
  agentCheck,
  agentJudge,
  describeAgentReport,
  isCi,
} from "./agent";

let outputDir: string;
let stdout: MockInstance;

const output = () =>
  JSON.parse(stdout.mock.calls.map((call) => String(call[0])).join(""));

const png = (height: number, fill: string) =>
  sharp({
    create: { width: 120, height, channels: 4, background: "#ffffff" },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="${height}"><rect x="10" y="10" width="60" height="30" fill="${fill}"/></svg>`,
        ),
      },
    ])
    .png()
    .toBuffer();

const write = async (dir: string, name: string, buffer: Buffer) => {
  const file = path.join(outputDir, dir, `${name}.png`);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, buffer);
};

beforeEach(async () => {
  outputDir = await fsp.mkdtemp(path.join(os.tmpdir(), "cappa-cli-agent-"));
  getConfigMock.mockResolvedValue({ outputDir, diff: {} });
  stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  process.exitCode = undefined;
  delete process.env.CI;

  // `grown` changed size (ambiguous), `new-one` has no baseline.
  await write("expected", "grown", await png(60, "#333366"));
  await write("actual", "grown", await png(90, "#333366"));
  await write("diff", "grown", await png(90, "#333366"));
  await write("actual", "new-one", await png(60, "#333366"));
});

afterEach(async () => {
  stdout.mockRestore();
  process.exitCode = undefined;
  delete process.env.CI;
  await fsp.rm(outputDir, { recursive: true, force: true });
});

describe("isCi", () => {
  it("reads CI like CI providers set it", () => {
    expect(isCi({ CI: "true" })).toBe(true);
    expect(isCi({ CI: "1" })).toBe(true);
    expect(isCi({ CI: "false" })).toBe(false);
    expect(isCi({ CI: "0" })).toBe(false);
    expect(isCi({})).toBe(false);
  });
});

describe("agent check", () => {
  it("prints the slim report and fails while anything differs", async () => {
    await agentCheck({ json: true, judge: "ambiguous" });

    const report = output();
    expect(report).toMatchObject({
      total: 2,
      changed: 1,
      new: 1,
      pendingJudgments: 1,
    });
    expect(report.results.map((r: { name: string }) => r.name)).toEqual([
      "grown",
      "new-one",
    ]);
    expect(process.exitCode).toBe(1);
  });

  it("reports errors as JSON", async () => {
    getConfigMock.mockRejectedValueOnce(new Error("no config"));

    await agentCheck({ json: true, judge: "ambiguous" });

    expect(output()).toEqual({ error: "no config" });
    expect(process.exitCode).toBe(1);
  });
});

describe("agent judge", () => {
  it("records a verdict that the next check applies", async () => {
    await agentCheck({ json: true, judge: "ambiguous" });
    stdout.mockClear();

    await agentJudge(["grown"], {
      json: true,
      label: "intentional-likely",
      headline: "footer added",
    });
    expect(output().written[0].name).toBe("grown");
    stdout.mockClear();

    await agentCheck({ json: true, judge: "ambiguous" });
    expect(output().results[0].verdict).toMatchObject({
      label: "intentional-likely",
      source: "agent",
    });
  });

  it("fails for a screenshot without a request", async () => {
    await agentJudge(["new-one"], {
      json: true,
      label: "noise-likely",
      headline: "x",
    });
    expect(output().error).toMatch(/No judgment request/);
  });
});

describe("agent approve", () => {
  it("approves exact names and clears their judgment", async () => {
    await agentCheck({ json: true, judge: "ambiguous" });
    stdout.mockClear();

    await agentApprove(["grown", "new-one"], { json: true });

    expect(output().approved).toEqual([
      { name: "grown", category: "changed" },
      { name: "new-one", category: "new" },
    ]);
    const expected = await sharp(
      path.join(outputDir, "expected/grown.png"),
    ).metadata();
    expect(expected.height).toBe(90);
    await expect(
      fsp.access(path.join(outputDir, ".cappa-agent/judgments/grown")),
    ).rejects.toThrow();
  });

  it("does not substring-match names", async () => {
    await agentApprove(["grow"], { json: true });
    expect(output().error).toMatch(/Nothing to approve for: grow/);
  });

  it("approves by verdict label", async () => {
    await write("expected", "recolor", await png(60, "#333366"));
    await write("actual", "recolor", await png(60, "#cc3333"));
    await write("diff", "recolor", await png(60, "#cc3333"));

    await agentApprove([], { json: true, label: ["intentional-likely"] });

    expect(output().approved).toEqual([
      { name: "recolor", category: "changed" },
    ]);
  });

  it("refuses in CI", async () => {
    process.env.CI = "true";
    await agentApprove(["grown"], { json: true });
    expect(output().error).toMatch(/Refusing to approve in CI/);
    expect(process.exitCode).toBe(1);
  });

  it("requires names or a label", async () => {
    await agentApprove([], { json: true });
    expect(output().error).toMatch(/Name the screenshots/);
  });
});

describe("describeAgentReport", () => {
  it("summarises totals and one line per entry", () => {
    const report = {
      outputDir: "/out",
      totals: {
        total: 3,
        passed: 1,
        changed: 1,
        new: 1,
        deleted: 0,
        pendingJudgments: 1,
      },
      entries: [
        {
          name: "card",
          category: "changed",
          pending: true,
          verdict: {
            label: "ambiguous",
            headline: "image dimensions changed",
            rationale: [],
            action: "investigate",
            source: "heuristic",
          },
        },
        { name: "fresh", category: "new", pending: false, paths: {} },
      ],
    } as unknown as AgentReport;

    const lines = describeAgentReport(report).map(stripVTControlCharacters);
    expect(lines).toEqual([
      "1/3 passed · 1 changed · 1 new · 0 deleted",
      "1 awaiting judgment in /out/.cappa-agent/judgments",
      "card  ambiguous — image dimensions changed (pending)",
      "fresh  new",
    ]);
  });
});
