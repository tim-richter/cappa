import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  type ChangeRegion,
  type InterpretResult,
  interpret,
} from "@blazediff/interpret-native";
import sharp from "sharp";
import { mapWithConcurrency } from "../mapWithConcurrency";
import { collectScreenshots } from "../screenshots/collectScreenshots";
import type { DiffOptions, Screenshot } from "../types";
import { renderJudgmentTiles, renderOverview } from "./tiles";
import {
  ACTION_BY_LABEL,
  deriveVerdict,
  isJudgedLabel,
  type JudgedLabel,
  normalizeChangeType,
  type Verdict,
} from "./verdict";

/**
 * Agent review: turn the screenshots on disk into something a coding agent
 * can judge cheaply, and fold its judgments back in.
 *
 * Nothing here captures. It reads `actual/`, `expected/` and `diff/` as the
 * last `cappa capture` left them, so it is safe to run repeatedly — a re-run
 * is how an agent's verdicts are applied, and a re-capture invalidates them
 * automatically because every judgment is tied to a fingerprint of the two
 * images it was made about.
 *
 * Layout, all inside `<outputDir>/.cappa-agent/` (dot-prefixed, so neither
 * screenshot collection nor the review server's static handler touch it):
 *
 * ```
 * report.json                       full report of the last check
 * judgments/<name>/request.json     what to judge and where the evidence is
 * judgments/<name>/locator.png      thumbnail with every region outlined
 * judgments/<name>/regions.png      [expected | actual] crop per region
 * judgments/<name>/overview.png     instead of the two above when sizes differ
 * judgments/<name>/verdict.json     written by the judge
 * ```
 */
export const AGENT_DIRNAME = ".cappa-agent";

const REQUEST_FILE = "request.json";
const VERDICT_FILE = "verdict.json";
const JUDGMENT_FILES = [
  REQUEST_FILE,
  VERDICT_FILE,
  "locator.png",
  "regions.png",
  "overview.png",
];

/** Bumped only if `request.json` or `report.json` change incompatibly. */
export const AGENT_REPORT_VERSION = 1;

/**
 * Which changed screenshots get a judgment request.
 *
 * - `ambiguous`: only those the heuristic could not label (default)
 * - `all`: every changed screenshot, for a full second opinion
 * - `none`: heuristic labels only, no new requests
 *
 * Judgments that already exist are kept and applied in every mode.
 */
export type JudgeMode = "ambiguous" | "all" | "none";

export const JUDGE_MODES: readonly JudgeMode[] = ["ambiguous", "all", "none"];

export type AgentRegion = {
  /** 1-based, matching the numbers in `locator.png` and rows in `regions.png`. */
  index: number;
  bbox: { x: number; y: number; width: number; height: number };
  pixelCount: number;
  percentage: number;
  position: string;
  shape: string;
  changeType: string;
  confidence: number;
};

export type AppliedVerdict = Verdict & {
  /** Whether the label came from the heuristic or from a judge. */
  source: "heuristic" | "agent";
  confidence?: number;
};

export type JudgmentPaths = {
  dir: string;
  request: string;
  verdict: string;
  locator?: string;
  regions?: string;
  overview?: string;
};

export type AgentReportEntry = {
  name: string;
  category: "changed" | "new" | "deleted";
  taskId?: string;
  plugin?: string;
  /** Absolute paths to the screenshot files. */
  paths: { expected?: string; actual?: string; diff?: string };
  percentDifference?: number;
  numDiffPixels?: number;
  dimensions?: {
    expected: { width: number; height: number };
    actual: { width: number; height: number };
  };
  severity?: string;
  summary?: string;
  /** Largest first. */
  regions?: AgentRegion[];
  heuristic?: Verdict;
  /** The judge's verdict when there is a current one, else the heuristic's. */
  verdict?: AppliedVerdict;
  /** A judgment was requested and no valid verdict has been written yet. */
  pending: boolean;
  judgment?: JudgmentPaths;
  /** Why a `verdict.json` that exists was ignored. */
  verdictError?: string;
};

export type AgentReport = {
  version: number;
  createdAt: string;
  outputDir: string;
  reportPath: string;
  judge: JudgeMode;
  totals: {
    total: number;
    passed: number;
    changed: number;
    new: number;
    deleted: number;
    pendingJudgments: number;
  };
  /** Every non-passing screenshot, changed ones first. */
  entries: AgentReportEntry[];
};

export const agentDir = (outputDir: string): string =>
  path.resolve(outputDir, AGENT_DIRNAME);

const judgmentsRoot = (outputDir: string): string =>
  path.join(agentDir(outputDir), "judgments");

export const agentReportPath = (outputDir: string): string =>
  path.join(agentDir(outputDir), "report.json");

/**
 * The directory holding a screenshot's judgment.
 *
 * Screenshot names are relative paths (`example/button/primary`), so they map
 * onto nested directories directly; anything that would resolve outside the
 * judgments root is refused rather than written.
 */
export const judgmentDir = (outputDir: string, name: string): string => {
  const root = judgmentsRoot(outputDir);
  const dir = path.resolve(root, name);
  const relative = path.relative(root, dir);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Invalid screenshot name for a judgment: ${name}`);
  }
  return dir;
};

const exists = async (file: string): Promise<boolean> => {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
};

const readJson = async (file: string): Promise<unknown> => {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch {
    return undefined;
  }
};

const writeJson = async (file: string, value: unknown): Promise<void> => {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

/** Ties a judgment to the exact pair of images it was made about. */
export const fingerprintImages = async (
  expectedPath: string,
  actualPath: string,
): Promise<string> => {
  const [expected, actual] = await Promise.all([
    fsp.readFile(expectedPath),
    fsp.readFile(actualPath),
  ]);
  return createHash("sha256")
    .update(expected)
    .update("\0")
    .update(actual)
    .digest("hex");
};

export type ParsedAgentVerdict =
  | {
      ok: true;
      label: JudgedLabel;
      headline: string;
      rationale: string[];
      confidence?: number;
    }
  | { ok: false; error: string };

/**
 * Read a judge's verdict, accepting both the nested shape blazediff uses
 * (`{ verdict: { label, headline, rationale }, confidence }`) and a flat one
 * (`{ label, headline, rationale, confidence }`) — a judge that writes either
 * should not have its work thrown away over nesting.
 */
export const parseAgentVerdict = (raw: unknown): ParsedAgentVerdict => {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "verdict.json is not a JSON object" };
  }

  const outer = raw as Record<string, unknown>;
  const inner =
    typeof outer.verdict === "object" && outer.verdict !== null
      ? (outer.verdict as Record<string, unknown>)
      : outer;

  const label = inner.label;
  if (!isJudgedLabel(label)) {
    return {
      ok: false,
      error: `label must be one of regression-likely, intentional-likely, noise-likely (got ${JSON.stringify(label)})`,
    };
  }

  const headline =
    typeof inner.headline === "string" && inner.headline.trim()
      ? inner.headline.trim()
      : undefined;
  if (!headline) {
    return { ok: false, error: "headline must be a non-empty string" };
  }

  const toLines = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((line): line is string => typeof line === "string")
      : typeof value === "string" && value.trim()
        ? [value.trim()]
        : [];
  const rationale = [...toLines(inner.rationale)];
  if (inner !== outer) rationale.push(...toLines(outer.rationale));

  const rawConfidence = outer.confidence ?? inner.confidence;
  const confidence =
    typeof rawConfidence === "number" && Number.isFinite(rawConfidence)
      ? Math.min(1, Math.max(0, rawConfidence))
      : undefined;

  return {
    ok: true,
    label,
    headline,
    rationale,
    ...(confidence !== undefined ? { confidence } : {}),
  };
};

const readSize = async (file: string) => {
  const { width = 0, height = 0 } = await sharp(file).metadata();
  return { width, height };
};

const toAgentRegions = (regions: readonly ChangeRegion[]): AgentRegion[] =>
  [...regions]
    .sort((a, b) => b.pixelCount - a.pixelCount)
    .map((region, index) => ({
      index: index + 1,
      bbox: {
        x: region.bbox.x,
        y: region.bbox.y,
        width: region.bbox.width,
        height: region.bbox.height,
      },
      pixelCount: region.pixelCount,
      percentage: region.percentage,
      position: region.position,
      shape: region.shape,
      changeType: normalizeChangeType(region.changeType),
      confidence: region.confidence,
    }));

/**
 * The interpretation a capture already persisted, or a fresh one.
 *
 * `diff.interpret` is off by default, so most changed screenshots arrive
 * without one; computing it here means agent review works on any project
 * rather than only on those that opted into interpretation at capture time.
 */
const interpretationFor = async (
  screenshot: Extract<Screenshot, { category: "changed" }>,
  expectedPath: string,
  actualPath: string,
  diff: DiffOptions | undefined,
): Promise<InterpretResult | undefined> => {
  if (screenshot.diffMeta?.interpretation) {
    return screenshot.diffMeta.interpretation;
  }

  const pixel = diff && diff.type !== "gmsd" ? diff : undefined;
  try {
    return await interpret(expectedPath, actualPath, undefined, {
      source: "pixel",
      threshold: pixel?.threshold,
      antialiasing: pixel?.includeAA ?? false,
    });
  } catch {
    return undefined;
  }
};

const JUDGE_INSTRUCTIONS = [
  "Read locator.png and regions.png together. locator.png outlines every region (numbered) on a thumbnail; regions.png stacks one [expected | actual] row per region, in `regions` order.",
  "Open overview.png when it exists instead — the image dimensions changed, so no regions could be located.",
  "Only open paths.expected / paths.actual / paths.diff (full size) when a change clearly continues outside its crop.",
  "Write verdict.json next to this file, or run `cappa agent judge <name> --label <label> --headline <text>`.",
];

const VERDICT_SCHEMA = {
  label: "regression-likely | intentional-likely | noise-likely",
  headline: "one line describing what changed",
  rationale: ["short reasons"],
  confidence: "0..1",
};

export type RunAgentCheckOptions = {
  outputDir: string;
  /** The project's diff config — its threshold is reused for interpretation. */
  diff?: DiffOptions;
  judge?: JudgeMode;
  /** Regions rendered into `regions.png` per screenshot. Default 8. */
  maxTileRegions?: number;
  /** Screenshots analysed in parallel. Default 4. */
  concurrency?: number;
  now?: () => Date;
};

const analyseChanged = async (
  screenshot: Extract<Screenshot, { category: "changed" }>,
  options: Required<Pick<RunAgentCheckOptions, "outputDir" | "judge">> &
    RunAgentCheckOptions,
  createdAt: string,
): Promise<AgentReportEntry> => {
  const { outputDir } = options;
  const expectedPath = path.resolve(outputDir, screenshot.expectedPath);
  const actualPath = path.resolve(outputDir, screenshot.actualPath);
  const diffPath = path.resolve(outputDir, screenshot.diffPath);

  const [expectedSize, actualSize, diffExists] = await Promise.all([
    readSize(expectedPath),
    readSize(actualPath),
    exists(diffPath),
  ]);
  const differentSizes =
    expectedSize.width !== actualSize.width ||
    expectedSize.height !== actualSize.height;

  const interpretation = differentSizes
    ? undefined
    : await interpretationFor(
        screenshot,
        expectedPath,
        actualPath,
        options.diff,
      );

  const percentDifference =
    screenshot.diffMeta?.percentDifference ?? interpretation?.diffPercentage;
  const numDiffPixels =
    screenshot.diffMeta?.numDiffPixels ?? interpretation?.diffCount;
  const regions = toAgentRegions(interpretation?.regions ?? []);

  const heuristic = deriveVerdict({
    percentDifference,
    numDiffPixels,
    interpretation,
    differentSizes,
  });

  const entry: AgentReportEntry = {
    name: screenshot.name,
    category: "changed",
    ...(screenshot.taskId
      ? { taskId: screenshot.taskId, plugin: screenshot.plugin }
      : {}),
    paths: {
      expected: expectedPath,
      actual: actualPath,
      ...(diffExists ? { diff: diffPath } : {}),
    },
    percentDifference,
    numDiffPixels,
    dimensions: { expected: expectedSize, actual: actualSize },
    severity: interpretation?.severity?.toLowerCase(),
    summary: interpretation?.summary,
    regions,
    heuristic,
    verdict: { ...heuristic, source: "heuristic" },
    pending: false,
  };

  const dir = judgmentDir(outputDir, screenshot.name);
  const requestPath = path.join(dir, REQUEST_FILE);
  const verdictPath = path.join(dir, VERDICT_FILE);

  // A judgment that already exists is kept whatever the mode: a verdict the
  // judge wrote after `--judge all` must survive the next plain check rather
  // than be pruned because the heuristic happened to have an opinion too.
  const wantsJudgment =
    options.judge === "all" ||
    (options.judge === "ambiguous" && heuristic.label === "ambiguous") ||
    (await exists(requestPath));
  if (!wantsJudgment) return entry;

  const fingerprint = await fingerprintImages(expectedPath, actualPath);

  // A request made about different images makes its verdict meaningless:
  // drop the whole judgment and start over rather than apply a stale label.
  const previous = (await readJson(requestPath)) as
    | { fingerprint?: unknown }
    | undefined;
  if (previous && previous.fingerprint !== fingerprint) {
    await clearJudgmentFiles(dir);
  }

  await fsp.mkdir(dir, { recursive: true });

  const judgment: JudgmentPaths = {
    dir,
    request: requestPath,
    verdict: verdictPath,
  };
  if (differentSizes) {
    judgment.overview = await renderOverview({
      expectedPath,
      actualPath,
      outDir: dir,
    });
  } else {
    const tiles = await renderJudgmentTiles({
      expectedPath,
      actualPath,
      diffPath: diffExists ? diffPath : undefined,
      regions: regions.map((region) => region.bbox),
      outDir: dir,
      maxRegions: options.maxTileRegions,
    });
    if (tiles.locator) judgment.locator = tiles.locator;
    if (tiles.regions) judgment.regions = tiles.regions;
  }
  entry.judgment = judgment;

  await writeJson(requestPath, {
    version: AGENT_REPORT_VERSION,
    name: entry.name,
    taskId: entry.taskId,
    plugin: entry.plugin,
    fingerprint,
    createdAt,
    instructions: JUDGE_INSTRUCTIONS,
    verdictSchema: VERDICT_SCHEMA,
    heuristic,
    percentDifference,
    numDiffPixels,
    dimensions: entry.dimensions,
    severity: entry.severity,
    summary: entry.summary,
    regions,
    paths: {
      locator: judgment.locator,
      regions: judgment.regions,
      overview: judgment.overview,
      expected: expectedPath,
      actual: actualPath,
      diff: entry.paths.diff,
      verdict: verdictPath,
    },
  });

  if (!(await exists(verdictPath))) {
    entry.pending = true;
    return entry;
  }

  const parsed = parseAgentVerdict(await readJson(verdictPath));
  if (!parsed.ok) {
    entry.pending = true;
    entry.verdictError = parsed.error;
    return entry;
  }

  entry.verdict = {
    label: parsed.label,
    headline: parsed.headline,
    rationale: parsed.rationale,
    action: ACTION_BY_LABEL[parsed.label],
    source: "agent",
    ...(parsed.confidence !== undefined
      ? { confidence: parsed.confidence }
      : {}),
  };
  return entry;
};

const clearJudgmentFiles = async (dir: string): Promise<void> => {
  await Promise.all(
    JUDGMENT_FILES.map((file) => fsp.rm(path.join(dir, file), { force: true })),
  );
};

/**
 * Remove a screenshot's judgment — after it was approved, or because it is no
 * longer changed. Only the judgment's own files go: a directory can also be
 * the parent of another screenshot's judgment (`button` and `button/primary`).
 */
export const clearJudgment = async (
  outputDir: string,
  name: string,
): Promise<void> => {
  const dir = judgmentDir(outputDir, name);
  await clearJudgmentFiles(dir);
  await removeEmptyDirs(dir, judgmentsRoot(outputDir));
};

/** Remove `dir` and its parents up to (excluding) `root` while empty. */
const removeEmptyDirs = async (dir: string, root: string): Promise<void> => {
  let current = dir;
  while (current !== root && current.startsWith(root)) {
    try {
      await fsp.rmdir(current);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
};

const listRequestDirs = async (root: string): Promise<string[]> => {
  if (!(await exists(root))) return [];
  const files = await Array.fromAsync(
    fsp.glob(`**/${REQUEST_FILE}`, { cwd: root }),
  );
  return files.map((file) => path.resolve(root, path.dirname(file)));
};

/** Drop judgments for screenshots that no longer need one. */
const pruneJudgments = async (
  outputDir: string,
  keep: ReadonlySet<string>,
): Promise<void> => {
  const root = judgmentsRoot(outputDir);
  for (const dir of await listRequestDirs(root)) {
    if (keep.has(dir)) continue;
    await clearJudgmentFiles(dir);
    await removeEmptyDirs(dir, root);
  }
};

/**
 * Analyse every non-passing screenshot, write judgment requests for the ones
 * that need a judge, apply any verdicts already written, and persist the
 * full report to `<outputDir>/.cappa-agent/report.json`.
 */
export const runAgentCheck = async (
  options: RunAgentCheckOptions,
): Promise<AgentReport> => {
  const outputDir = path.resolve(options.outputDir);
  const judge = options.judge ?? "ambiguous";
  const createdAt = (options.now?.() ?? new Date()).toISOString();

  const screenshots = await collectScreenshots(outputDir);

  // Never commit agent scratch state: a judgment is only valid for the
  // images on this machine.
  await fsp.mkdir(agentDir(outputDir), { recursive: true });
  await fsp.writeFile(path.join(agentDir(outputDir), ".gitignore"), "*\n");

  const changed = screenshots.filter(
    (s): s is Extract<Screenshot, { category: "changed" }> =>
      s.category === "changed",
  );

  const changedEntries = await mapWithConcurrency(
    options.concurrency ?? 4,
    changed,
    (screenshot) =>
      analyseChanged(screenshot, { ...options, outputDir, judge }, createdAt),
  );

  await pruneJudgments(
    outputDir,
    new Set(
      changedEntries.flatMap((entry) =>
        entry.judgment ? [entry.judgment.dir] : [],
      ),
    ),
  );

  const otherEntries = screenshots.flatMap((s): AgentReportEntry[] => {
    if (s.category === "new") {
      return [
        {
          name: s.name,
          category: "new",
          ...(s.taskId ? { taskId: s.taskId, plugin: s.plugin } : {}),
          paths: { actual: path.resolve(outputDir, s.actualPath) },
          pending: false,
        },
      ];
    }
    if (s.category === "deleted") {
      return [
        {
          name: s.name,
          category: "deleted",
          paths: { expected: path.resolve(outputDir, s.expectedPath) },
          pending: false,
        },
      ];
    }
    return [];
  });

  const entries = [...changedEntries, ...otherEntries];
  const count = (category: Screenshot["category"]) =>
    screenshots.filter((s) => s.category === category).length;

  const report: AgentReport = {
    version: AGENT_REPORT_VERSION,
    createdAt,
    outputDir,
    reportPath: agentReportPath(outputDir),
    judge,
    totals: {
      total: screenshots.length,
      passed: count("passed"),
      changed: count("changed"),
      new: count("new"),
      deleted: count("deleted"),
      pendingJudgments: entries.filter((entry) => entry.pending).length,
    },
    entries,
  };

  await writeJson(report.reportPath, report);

  return report;
};

/** Read the report the last {@link runAgentCheck} wrote, if any. */
export const readAgentReport = async (
  outputDir: string,
): Promise<AgentReport | undefined> => {
  const raw = (await readJson(agentReportPath(outputDir))) as
    | AgentReport
    | undefined;
  return raw?.version === AGENT_REPORT_VERSION ? raw : undefined;
};

export type SlimAgentReport = {
  reportPath: string;
  total: number;
  passed: number;
  changed: number;
  new: number;
  deleted: number;
  pendingJudgments: number;
  results: Array<{
    name: string;
    category: AgentReportEntry["category"];
    verdict?: Pick<AppliedVerdict, "label" | "headline" | "action" | "source">;
    pending?: true;
    /** Judgment directory, present while a verdict is pending. */
    judgment?: string;
    verdictError?: string;
  }>;
};

/**
 * The report as an agent should first see it: one line of state per
 * screenshot, with the detail left in `report.json` and the judgment
 * requests for when it is actually needed.
 */
export const toSlimAgentReport = (report: AgentReport): SlimAgentReport => ({
  reportPath: report.reportPath,
  ...report.totals,
  results: report.entries.map((entry) => ({
    name: entry.name,
    category: entry.category,
    ...(entry.verdict
      ? {
          verdict: {
            label: entry.verdict.label,
            headline: entry.verdict.headline,
            action: entry.verdict.action,
            source: entry.verdict.source,
          },
        }
      : {}),
    ...(entry.pending ? { pending: true as const } : {}),
    ...(entry.pending && entry.judgment
      ? { judgment: entry.judgment.dir }
      : {}),
    ...(entry.verdictError ? { verdictError: entry.verdictError } : {}),
  })),
});

export type AgentVerdictInput = {
  label: JudgedLabel;
  headline: string;
  rationale?: string[];
  confidence?: number;
};

/**
 * Record a judge's verdict for a screenshot with a pending request — the
 * validated alternative to hand-writing `verdict.json`.
 */
export const writeAgentVerdict = async (
  outputDir: string,
  name: string,
  input: AgentVerdictInput,
): Promise<string> => {
  const dir = judgmentDir(outputDir, name);
  if (!(await exists(path.join(dir, REQUEST_FILE)))) {
    throw new Error(
      `No judgment request for "${name}" — run \`cappa agent check\` first (use --judge all to request one for any changed screenshot).`,
    );
  }

  const parsed = parseAgentVerdict(input);
  if (!parsed.ok) throw new Error(parsed.error);

  const verdictPath = path.join(dir, VERDICT_FILE);
  await writeJson(verdictPath, {
    name,
    verdict: {
      label: parsed.label,
      headline: parsed.headline,
      rationale: parsed.rationale,
      action: ACTION_BY_LABEL[parsed.label],
    },
    ...(parsed.confidence !== undefined
      ? { confidence: parsed.confidence }
      : {}),
  });
  return verdictPath;
};
