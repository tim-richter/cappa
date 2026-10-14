import path from "node:path";

/**
 * Where agent review keeps its state, inside `outputDir`.
 *
 * Its own module so screenshot collection can read the report without
 * importing the review pipeline, which itself collects screenshots.
 */
export const AGENT_DIRNAME = ".cappa-agent";

/** Bumped only if `request.json` or `report.json` change incompatibly. */
export const AGENT_REPORT_VERSION = 1;

export const agentDir = (outputDir: string): string =>
  path.resolve(outputDir, AGENT_DIRNAME);

export const judgmentsRoot = (outputDir: string): string =>
  path.join(agentDir(outputDir), "judgments");

export const agentReportPath = (outputDir: string): string =>
  path.join(agentDir(outputDir), "report.json");
