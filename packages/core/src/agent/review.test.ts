import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectScreenshots } from "../screenshots/collectScreenshots";
import { agentReportPath } from "./paths";
import {
  clearJudgment,
  judgmentDir,
  parseAgentVerdict,
  readAgentReport,
  runAgentCheck,
  toSlimAgentReport,
  writeAgentVerdict,
} from "./review";

let outputDir: string;

const png = (width: number, height: number, shapes: string): Promise<Buffer> =>
  sharp({
    create: { width, height, channels: 4, background: "#ffffff" },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shapes}</svg>`,
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

const BASE = '<rect x="20" y="20" width="100" height="40" fill="#333366"/>';

/** A changed screenshot: expected, actual and a (stand-in) diff image. */
const changed = async (name: string, expected: Buffer, actual: Buffer) => {
  await write("expected", name, expected);
  await write("actual", name, actual);
  await write("diff", name, actual);
};

beforeEach(async () => {
  outputDir = await fsp.mkdtemp(path.join(os.tmpdir(), "cappa-agent-"));
});

afterEach(async () => {
  await fsp.rm(outputDir, { recursive: true, force: true });
});

describe("runAgentCheck", () => {
  it("reports every non-passing screenshot and counts passed ones", async () => {
    const same = await png(200, 100, BASE);
    await write("expected", "passed", same);
    await write("actual", "passed", same);
    await write("actual", "brand-new", same);
    await write("expected", "removed", same);

    const report = await runAgentCheck({ outputDir });

    expect(report.totals).toEqual({
      total: 3,
      passed: 1,
      changed: 0,
      new: 1,
      deleted: 1,
      pendingJudgments: 0,
    });
    expect(report.entries.map((e) => [e.name, e.category])).toEqual([
      ["brand-new", "new"],
      ["removed", "deleted"],
    ]);
    expect(await readAgentReport(outputDir)).toEqual(report);
    await expect(
      fsp.readFile(path.join(outputDir, ".cappa-agent/.gitignore"), "utf8"),
    ).resolves.toBe("*\n");
  });

  it("writes a judgment request with tiles for ambiguous changes", async () => {
    await changed(
      "components/card",
      await png(
        400,
        300,
        `${BASE}<text x="200" y="200" font-size="30">Hello</text>`,
      ),
      await png(
        400,
        300,
        `<rect x="20" y="20" width="100" height="40" fill="#cc3333"/><text x="200" y="200" font-size="30">World</text><rect x="300" y="250" width="60" height="30" fill="#000"/>`,
      ),
    );

    const report = await runAgentCheck({ outputDir, judge: "all" });
    const [entry] = report.entries;

    expect(entry?.category).toBe("changed");
    expect(entry?.regions?.length).toBeGreaterThan(0);
    expect(entry?.regions?.[0]?.index).toBe(1);
    expect(entry?.pending).toBe(true);
    expect(entry?.verdict?.source).toBe("heuristic");
    expect(report.totals.pendingJudgments).toBe(1);

    const dir = judgmentDir(outputDir, "components/card");
    expect(entry?.judgment?.dir).toBe(dir);

    const request = JSON.parse(
      await fsp.readFile(path.join(dir, "request.json"), "utf8"),
    );
    expect(request.name).toBe("components/card");
    expect(request.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(request.regions).toEqual(entry?.regions);

    const locator = await sharp(path.join(dir, "locator.png")).metadata();
    expect(locator.width).toBeLessThanOrEqual(400);
    const tiles = await sharp(path.join(dir, "regions.png")).metadata();
    expect(tiles.width).toBeGreaterThan(0);

    const slim = toSlimAgentReport(report);
    expect(slim.results).toEqual([
      expect.objectContaining({
        name: "components/card",
        pending: true,
        judgment: dir,
      }),
    ]);
  });

  it("does not request judgments for labelled changes by default", async () => {
    await changed(
      "recolor",
      await png(200, 100, BASE),
      await png(
        200,
        100,
        '<rect x="20" y="20" width="100" height="40" fill="#cc3333"/>',
      ),
    );

    const report = await runAgentCheck({ outputDir });
    const [entry] = report.entries;

    expect(entry?.heuristic?.label).not.toBe("ambiguous");
    expect(entry?.judgment).toBeUndefined();
    expect(entry?.pending).toBe(false);
  });

  it("renders an overview instead of tiles when dimensions differ", async () => {
    await changed(
      "grown",
      await png(200, 100, BASE),
      await png(200, 160, BASE),
    );

    const report = await runAgentCheck({ outputDir });
    const [entry] = report.entries;

    expect(entry?.heuristic?.headline).toBe("image dimensions changed");
    expect(entry?.judgment?.overview).toBeDefined();
    expect(entry?.judgment?.regions).toBeUndefined();
    const overview = await sharp(entry?.judgment?.overview).metadata();
    expect(overview.height).toBe(160 + 18);
  });

  it("applies a written verdict on the next check", async () => {
    await changed(
      "grown",
      await png(200, 100, BASE),
      await png(200, 160, BASE),
    );
    await runAgentCheck({ outputDir });

    await writeAgentVerdict(outputDir, "grown", {
      label: "intentional-likely",
      headline: "new section added below the card",
      confidence: 0.8,
    });

    const report = await runAgentCheck({ outputDir });
    expect(report.totals.pendingJudgments).toBe(0);
    expect(report.entries[0]?.verdict).toEqual({
      label: "intentional-likely",
      headline: "new section added below the card",
      rationale: [],
      action: "approve-if-intended",
      source: "agent",
      confidence: 0.8,
    });
  });

  it("keeps verdicts from --judge all on a later default check", async () => {
    await changed(
      "recolor",
      await png(200, 100, BASE),
      await png(
        200,
        100,
        '<rect x="20" y="20" width="100" height="40" fill="#cc3333"/>',
      ),
    );
    await runAgentCheck({ outputDir, judge: "all" });
    await writeAgentVerdict(outputDir, "recolor", {
      label: "regression-likely",
      headline: "brand color lost",
    });

    const report = await runAgentCheck({ outputDir, judge: "none" });

    expect(report.entries[0]?.verdict).toMatchObject({
      label: "regression-likely",
      source: "agent",
    });
  });

  it("drops a verdict once the screenshots it judged change", async () => {
    await changed(
      "grown",
      await png(200, 100, BASE),
      await png(200, 160, BASE),
    );
    await runAgentCheck({ outputDir });
    await writeAgentVerdict(outputDir, "grown", {
      label: "noise-likely",
      headline: "noise",
    });

    await write("actual", "grown", await png(200, 180, BASE));
    const report = await runAgentCheck({ outputDir });

    expect(report.entries[0]?.pending).toBe(true);
    expect(report.entries[0]?.verdict?.source).toBe("heuristic");
    await expect(
      fsp.access(path.join(judgmentDir(outputDir, "grown"), "verdict.json")),
    ).rejects.toThrow();
  });

  it("keeps an invalid verdict pending and says why", async () => {
    await changed(
      "grown",
      await png(200, 100, BASE),
      await png(200, 160, BASE),
    );
    await runAgentCheck({ outputDir });
    await fsp.writeFile(
      path.join(judgmentDir(outputDir, "grown"), "verdict.json"),
      JSON.stringify({ label: "ambiguous", headline: "dunno" }),
    );

    const report = await runAgentCheck({ outputDir });
    expect(report.entries[0]?.pending).toBe(true);
    expect(report.entries[0]?.verdictError).toContain("label must be one of");
  });

  it("prunes judgments for screenshots that no longer need one", async () => {
    await changed(
      "parent",
      await png(200, 100, BASE),
      await png(200, 160, BASE),
    );
    await changed(
      "parent/child",
      await png(200, 100, BASE),
      await png(200, 160, BASE),
    );
    await runAgentCheck({ outputDir });

    // `parent` is approved; `parent/child` still lives inside its directory.
    const same = await png(200, 160, BASE);
    await write("expected", "parent", same);
    await fsp.rm(path.join(outputDir, "diff/parent.png"));

    await runAgentCheck({ outputDir });

    const parentDir = judgmentDir(outputDir, "parent");
    await expect(
      fsp.access(path.join(parentDir, "request.json")),
    ).rejects.toThrow();
    await expect(
      fsp.access(path.join(parentDir, "child", "request.json")),
    ).resolves.toBeUndefined();
  });

  it("writes the report to .cappa-agent/report.json", async () => {
    const report = await runAgentCheck({ outputDir });
    expect(report.reportPath).toBe(agentReportPath(outputDir));
  });
});

describe("review folded into collectScreenshots", () => {
  const reviewOf = async (name: string) => {
    const screenshot = (await collectScreenshots(outputDir)).find(
      (s) => s.name === name,
    );
    return screenshot?.category === "changed" ? screenshot.review : undefined;
  };

  it("carries the last check's verdict on changed screenshots", async () => {
    await changed(
      "grown",
      await png(200, 100, BASE),
      await png(200, 160, BASE),
    );
    expect(await reviewOf("grown")).toBeUndefined();

    const report = await runAgentCheck({ outputDir });

    expect(await reviewOf("grown")).toEqual({
      label: "ambiguous",
      headline: "image dimensions changed",
      rationale: expect.any(Array),
      action: "investigate",
      source: "heuristic",
      pending: true,
      reviewedAt: report.createdAt,
    });
  });

  it("carries a judge's verdict once a check applied it", async () => {
    await changed(
      "grown",
      await png(200, 100, BASE),
      await png(200, 160, BASE),
    );
    await runAgentCheck({ outputDir });
    await writeAgentVerdict(outputDir, "grown", {
      label: "intentional-likely",
      headline: "new footer",
      rationale: ["matches the footer change"],
      confidence: 0.7,
    });
    await runAgentCheck({ outputDir });

    expect(await reviewOf("grown")).toMatchObject({
      label: "intentional-likely",
      source: "agent",
      confidence: 0.7,
      pending: false,
      rationale: ["matches the footer change"],
    });
  });

  it("drops the verdict once the screenshot is re-captured", async () => {
    await changed(
      "grown",
      await png(200, 100, BASE),
      await png(200, 160, BASE),
    );
    await runAgentCheck({ outputDir });
    expect(await reviewOf("grown")).toBeDefined();

    // A capture after the check: the actual image is newer than the report.
    const later = new Date(Date.now() + 60_000);
    await fsp.utimes(path.join(outputDir, "actual/grown.png"), later, later);

    expect(await reviewOf("grown")).toBeUndefined();
  });

  it("ignores a corrupt report", async () => {
    await changed(
      "grown",
      await png(200, 100, BASE),
      await png(200, 160, BASE),
    );
    await runAgentCheck({ outputDir });
    await fsp.writeFile(agentReportPath(outputDir), "{not json");

    expect(await reviewOf("grown")).toBeUndefined();
  });
});

describe("writeAgentVerdict", () => {
  it("refuses a screenshot without a request", async () => {
    await expect(
      writeAgentVerdict(outputDir, "missing", {
        label: "noise-likely",
        headline: "x",
      }),
    ).rejects.toThrow(/No judgment request/);
  });
});

describe("clearJudgment", () => {
  it("removes the judgment files and empty directories", async () => {
    await changed("a/b", await png(200, 100, BASE), await png(200, 160, BASE));
    await runAgentCheck({ outputDir });

    await clearJudgment(outputDir, "a/b");

    await expect(
      fsp.access(path.join(outputDir, ".cappa-agent/judgments/a")),
    ).rejects.toThrow();
  });
});

describe("judgmentDir", () => {
  it("refuses names that escape the judgments directory", () => {
    expect(() => judgmentDir(outputDir, "../../etc")).toThrow();
  });
});

describe("parseAgentVerdict", () => {
  it("accepts the nested blazediff shape", () => {
    expect(
      parseAgentVerdict({
        id: "x",
        verdict: {
          label: "regression-likely",
          headline: "button clipped",
          rationale: ["text cut off"],
          action: "investigate",
        },
        rationale: "the label overflows",
        confidence: 2,
      }),
    ).toEqual({
      ok: true,
      label: "regression-likely",
      headline: "button clipped",
      rationale: ["text cut off", "the label overflows"],
      confidence: 1,
    });
  });

  it("accepts a flat shape", () => {
    expect(
      parseAgentVerdict({ label: "noise-likely", headline: "aa" }),
    ).toEqual({
      ok: true,
      label: "noise-likely",
      headline: "aa",
      rationale: [],
    });
  });

  it("rejects a missing headline", () => {
    expect(parseAgentVerdict({ label: "noise-likely" })).toEqual({
      ok: false,
      error: "headline must be a non-empty string",
    });
  });
});
