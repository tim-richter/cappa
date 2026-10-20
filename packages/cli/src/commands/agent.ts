import { getConfig } from "@cappa/config";
import {
  type AgentReport,
  clearJudgment,
  collectScreenshots,
  isJudgedLabel,
  JUDGE_MODES,
  JUDGED_LABELS,
  type JudgedLabel,
  type JudgeMode,
  readAgentReport,
  runAgentCheck,
  ScreenshotFileSystem,
  toSlimAgentReport,
  type VerdictLabel,
  writeAgentVerdict,
} from "@cappa/core";
import { getLogger } from "@cappa/logger";
import chalk from "chalk";
import { type Command, InvalidArgumentError } from "commander";
import {
  detectSkillStacks,
  installAgentSkills,
  SKILL_STACK_NAMES,
  type SkillStack,
} from "../utils/agentSkills";

/**
 * `cappa agent` — visual review for coding agents.
 *
 * Every subcommand takes `--json`, which prints exactly one JSON document to
 * stdout and nothing else, so an agent can parse it without scraping logs.
 */

type JsonOption = { json?: boolean };

const printJson = (value: unknown) => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

/** `CI=true`/`CI=1` — but not `CI=false`, which some tools set explicitly. */
export const isCi = (env: NodeJS.ProcessEnv = process.env): boolean => {
  const value = env.CI?.trim().toLowerCase();
  return !!value && value !== "false" && value !== "0";
};

/**
 * Run `action`, reporting a failure as `{ error }` under `--json` instead of
 * a log line an agent would have to find.
 */
const run = async (
  options: JsonOption,
  action: () => Promise<void>,
): Promise<void> => {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      printJson({ error: message });
    } else {
      getLogger().error(message);
    }
    process.exitCode = 1;
  }
};

const LABEL_COLORS: Record<VerdictLabel, (text: string) => string> = {
  "regression-likely": chalk.red,
  "intentional-likely": chalk.green,
  "noise-likely": chalk.gray,
  ambiguous: chalk.yellow,
};

/** Human-readable lines for a report — what `--json` prints, for people. */
export const describeAgentReport = (report: AgentReport): string[] => {
  const { totals } = report;
  const lines = [
    `${totals.passed}/${totals.total} passed · ${totals.changed} changed · ${totals.new} new · ${totals.deleted} deleted`,
  ];
  if (totals.pendingJudgments > 0) {
    lines.push(
      chalk.yellow(
        `${totals.pendingJudgments} awaiting judgment in ${report.outputDir}/.cappa-agent/judgments`,
      ),
    );
  }

  for (const entry of report.entries) {
    if (entry.category !== "changed" || !entry.verdict) {
      lines.push(`${chalk.bold(entry.name)}  ${chalk.dim(entry.category)}`);
      continue;
    }
    const { label, headline, source } = entry.verdict;
    const tags = [
      source === "agent" ? "judged" : undefined,
      entry.pending ? "pending" : undefined,
    ].filter(Boolean);
    lines.push(
      `${chalk.bold(entry.name)}  ${LABEL_COLORS[label](label)} — ${headline}${tags.length > 0 ? chalk.dim(` (${tags.join(", ")})`) : ""}`,
    );
    if (entry.verdictError) {
      lines.push(chalk.red(`  verdict.json ignored: ${entry.verdictError}`));
    }
  }

  return lines;
};

type CheckOptions = JsonOption & {
  judge: JudgeMode;
  maxTileRegions?: number;
};

export const agentCheck = (options: CheckOptions) =>
  run(options, async () => {
    const config = await getConfig();

    const report = await runAgentCheck({
      outputDir: config.outputDir,
      diff: config.diff,
      judge: options.judge,
      maxTileRegions: options.maxTileRegions,
    });

    if (options.json) {
      printJson(toSlimAgentReport(report));
    } else {
      getLogger().box({
        title: "Agent Review",
        message: describeAgentReport(report).join("\n"),
      });
    }

    if (report.entries.length > 0) {
      process.exitCode = 1;
    }
  });

type JudgeOptions = JsonOption & {
  label: JudgedLabel;
  headline: string;
  rationale?: string[];
  confidence?: number;
};

export const agentJudge = (names: string[], options: JudgeOptions) =>
  run(options, async () => {
    const config = await getConfig();

    const written: Array<{ name: string; verdict: string }> = [];
    for (const name of names) {
      const verdict = await writeAgentVerdict(config.outputDir, name, {
        label: options.label,
        headline: options.headline,
        rationale: options.rationale,
        confidence: options.confidence,
      });
      written.push({ name, verdict });
    }

    if (options.json) {
      printJson({ written });
    } else {
      getLogger().success(
        `Recorded ${options.label} for ${written.length} screenshot(s) — run \`cappa agent check\` to apply`,
      );
    }
  });

type ApproveOptions = JsonOption & {
  label?: JudgedLabel[];
  allowRegression?: boolean;
};

export const agentApprove = (names: string[], options: ApproveOptions) =>
  run(options, async () => {
    if (isCi()) {
      throw new Error(
        "Refusing to approve in CI — baselines are only changed on developer machines.",
      );
    }
    if (names.length === 0 && !options.label?.length) {
      throw new Error("Name the screenshots to approve, or pass --label.");
    }

    const config = await getConfig();
    const screenshots = await collectScreenshots(config.outputDir);
    const byName = new Map(screenshots.map((s) => [s.name, s]));

    const wanted = new Set(names);
    const unknown = names.filter((name) => {
      const screenshot = byName.get(name);
      return !screenshot || screenshot.category === "passed";
    });
    if (unknown.length > 0) {
      throw new Error(
        `Nothing to approve for: ${unknown.join(", ")} — names must match exactly (see \`cappa agent check --json\`).`,
      );
    }

    // Re-check rather than trusting the last report: approving off a label
    // the screenshots no longer carry is exactly the mistake to prevent, and
    // a changed screenshot's current verdict is what the regression guard
    // below needs.
    const verdicts = new Map<string, VerdictLabel>();
    const needsCheck =
      !!options.label?.length ||
      names.some((name) => byName.get(name)?.category === "changed");
    if (needsCheck) {
      const previous = await readAgentReport(config.outputDir);
      const report = await runAgentCheck({
        outputDir: config.outputDir,
        diff: config.diff,
        judge: previous?.judge ?? "ambiguous",
      });
      for (const entry of report.entries) {
        if (entry.category === "changed" && entry.verdict) {
          verdicts.set(entry.name, entry.verdict.label);
        }
      }
    }

    const labels = new Set<string>(options.label);
    for (const [name, label] of verdicts) {
      if (labels.has(label)) wanted.add(name);
    }

    const toApprove = [...wanted].flatMap((name) => {
      const screenshot = byName.get(name);
      return screenshot && screenshot.category !== "passed" ? [screenshot] : [];
    });

    const regressions = toApprove
      .filter((s) => verdicts.get(s.name) === "regression-likely")
      .map((s) => s.name);
    if (regressions.length > 0 && !options.allowRegression) {
      throw new Error(
        `Refusing to approve regression-likely: ${regressions.join(", ")} — if the change is intended, judge it (\`cappa agent check --judge all\`, then \`cappa agent judge <name> --label intentional-likely\`), or pass --allow-regression.`,
      );
    }

    const fileSystem = new ScreenshotFileSystem(config.outputDir);
    await fileSystem.approveScreenshots(toApprove, config.diff);
    await Promise.all(
      toApprove.map((screenshot) =>
        clearJudgment(config.outputDir, screenshot.name),
      ),
    );

    const approved = toApprove.map((s) => ({
      name: s.name,
      category: s.category,
    }));
    if (options.json) {
      printJson({ approved });
    } else if (approved.length === 0) {
      getLogger().warn("No screenshots matched");
    } else {
      getLogger().success(
        `Approved ${approved.length} screenshot(s): ${approved.map((s) => s.name).join(", ")}`,
      );
    }
  });

type InitOptions = JsonOption & {
  stack?: SkillStack | "all";
  force?: boolean;
  runner?: string;
};

export const agentInit = (options: InitOptions) =>
  run(options, async () => {
    const cwd = process.cwd();
    const stacks =
      options.stack === "all"
        ? SKILL_STACK_NAMES
        : options.stack
          ? [options.stack]
          : detectSkillStacks(cwd);

    const { runner, files, warnings } = await installAgentSkills({
      cwd,
      stacks,
      force: options.force,
      runner: options.runner,
    });

    if (options.json) {
      printJson({ stacks, runner, files, warnings });
      return;
    }

    const logger = getLogger();
    for (const file of files) {
      const verb = {
        written: chalk.green("wrote"),
        unchanged: chalk.dim("unchanged"),
        skipped: chalk.yellow("skipped (modified — use --force)"),
      }[file.status];
      logger.log(`${verb} ${file.path}`);
    }
    logger.log(chalk.dim(`commands run as \`${runner}\` (--runner to change)`));
    for (const warning of warnings) {
      logger.warn(warning);
    }
    logger.success(
      stacks.includes("opencode")
        ? "Agent integration installed — run /cappa-review in OpenCode, or /cappa in Claude Code"
        : "Agent skill installed — ask your agent to run a visual review, or use /cappa in Claude Code",
    );
  });

const parseChoice =
  <T extends string>(choices: readonly T[], what: string) =>
  (value: string): T => {
    if (!(choices as readonly string[]).includes(value)) {
      throw new InvalidArgumentError(
        `${what} must be one of: ${choices.join(", ")}`,
      );
    }
    return value as T;
  };

const parseLabel = (value: string): JudgedLabel => {
  if (!isJudgedLabel(value)) {
    throw new InvalidArgumentError(
      `label must be one of: ${JUDGED_LABELS.join(", ")}`,
    );
  }
  return value;
};

const collectLabel = (value: string, previous: JudgedLabel[] = []) => [
  ...previous,
  parseLabel(value),
];

const parseConfidence = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new InvalidArgumentError("confidence must be a number from 0 to 1");
  }
  return parsed;
};

const parsePositiveInt = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError("must be a positive integer");
  }
  return parsed;
};

export const registerAgentCommand = (program: Command): void => {
  const agent = program
    .command("agent")
    .description(
      "Visual review for coding agents: label changes, hand ambiguous ones to an agent, approve",
    );

  agent
    .command("check")
    .description(
      "Label every changed screenshot and write judgment requests for an agent (does not capture)",
    )
    .option(
      "--judge <mode>",
      `which changes get a judgment request: ${JUDGE_MODES.join(", ")}`,
      parseChoice(JUDGE_MODES, "--judge"),
      "ambiguous",
    )
    .option(
      "--max-tile-regions <count>",
      "regions rendered into each regions.png",
      parsePositiveInt,
    )
    .option("--json", "print a JSON summary to stdout")
    .action(agentCheck);

  agent
    .command("judge")
    .description("Record a verdict for screenshots with a judgment request")
    .argument("<names...>", "screenshot names, exactly as reported")
    .requiredOption("--label <label>", JUDGED_LABELS.join(" | "), parseLabel)
    .requiredOption("--headline <text>", "one line describing the change")
    .option("--rationale <text...>", "reasons for the verdict")
    .option("--confidence <number>", "0 to 1", parseConfidence)
    .option("--json", "print a JSON summary to stdout")
    .action(agentJudge);

  agent
    .command("approve")
    .description(
      "Approve screenshots by exact name or by verdict label (refused in CI)",
    )
    .argument("[names...]", "screenshot names, exactly as reported")
    .option(
      "--label <label>",
      "also approve every changed screenshot with this verdict label (repeatable)",
      collectLabel,
    )
    .option(
      "--allow-regression",
      "approve screenshots whose current verdict is regression-likely",
    )
    .option("--json", "print a JSON summary to stdout")
    .action(agentApprove);

  agent
    .command("init")
    .description("Install the cappa skill for coding agents in this project")
    .option(
      "--stack <stack>",
      `${SKILL_STACK_NAMES.join(", ")} or all (default: detected)`,
      parseChoice([...SKILL_STACK_NAMES, "all"] as const, "--stack"),
    )
    .option("--force", "overwrite skill files that were modified")
    .option(
      "--runner <command>",
      "how the project runs cappa, e.g. `pnpm exec cappa` (default: from the lockfile)",
    )
    .option("--json", "print a JSON summary to stdout")
    .action(agentInit);
};
