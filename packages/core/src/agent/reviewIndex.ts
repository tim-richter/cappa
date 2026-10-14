import fsp from "node:fs/promises";
import path from "node:path";
import type { AgentReview } from "../types";
import { AGENT_REPORT_VERSION, agentReportPath } from "./paths";
import { isVerdictLabel } from "./verdict";

/**
 * The verdicts of the last `cappa agent check`, keyed by screenshot name.
 *
 * Read on every screenshot listing so the review UI shows them, which is why
 * this reads only `report.json` and never touches the review pipeline.
 */
export type AgentReviewIndex = {
  createdAt: number;
  reviews: Map<string, AgentReview>;
};

type ReportShape = {
  version?: unknown;
  createdAt?: unknown;
  entries?: unknown;
};

/**
 * Read the review index, or nothing.
 *
 * Never throws: like the capture manifest, the report is an extra, and a
 * missing or hand-edited file must not break the screenshot listing.
 */
export const readAgentReviewIndex = async (
  outputDir: string,
): Promise<AgentReviewIndex | undefined> => {
  let raw: ReportShape;
  try {
    raw = JSON.parse(await fsp.readFile(agentReportPath(outputDir), "utf8"));
  } catch {
    return undefined;
  }

  const createdAt =
    typeof raw?.createdAt === "string" ? Date.parse(raw.createdAt) : NaN;
  if (
    raw?.version !== AGENT_REPORT_VERSION ||
    Number.isNaN(createdAt) ||
    !Array.isArray(raw.entries)
  ) {
    return undefined;
  }

  const reviews = new Map<string, AgentReview>();
  for (const entry of raw.entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const { name, category, verdict, pending } = entry as Record<
      string,
      unknown
    >;
    if (typeof name !== "string" || category !== "changed") continue;
    if (typeof verdict !== "object" || verdict === null) continue;

    const v = verdict as Record<string, unknown>;
    if (!isVerdictLabel(v.label) || typeof v.headline !== "string") continue;

    reviews.set(name, {
      label: v.label,
      headline: v.headline,
      rationale: Array.isArray(v.rationale)
        ? v.rationale.filter((line): line is string => typeof line === "string")
        : [],
      action: v.action as AgentReview["action"],
      source: v.source === "agent" ? "agent" : "heuristic",
      ...(typeof v.confidence === "number" ? { confidence: v.confidence } : {}),
      pending: pending === true,
      reviewedAt: new Date(createdAt).toISOString(),
    });
  }

  return { createdAt, reviews };
};

const modifiedAt = async (file: string): Promise<number> => {
  try {
    return (await fsp.stat(file)).mtimeMs;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

/**
 * The review for a changed screenshot, if it is still about these images.
 *
 * A capture after the check rewrites `actual/`, an approval rewrites
 * `expected/`; either makes the verdict describe pixels that are gone. File
 * times are compared rather than content hashed because this runs on every
 * listing the review UI makes.
 */
export const freshAgentReview = async (
  index: AgentReviewIndex | undefined,
  outputDir: string,
  screenshot: { name: string; actualPath: string; expectedPath: string },
): Promise<AgentReview | undefined> => {
  const review = index?.reviews.get(screenshot.name);
  if (!index || !review) return undefined;

  const [actual, expected] = await Promise.all([
    modifiedAt(path.resolve(outputDir, screenshot.actualPath)),
    modifiedAt(path.resolve(outputDir, screenshot.expectedPath)),
  ]);

  return actual <= index.createdAt && expected <= index.createdAt
    ? review
    : undefined;
};
