#!/usr/bin/env node
/**
 * Capture-output parity harness.
 *
 * Runs `cappa capture` through six scenarios against a real project and records
 * (or checks) the normalised terminal output and exit code of each. The CLI's
 * output is its contract; this is what proves a refactor did not change it.
 *
 *   node scripts/capture-parity/run.mjs --record          # write baselines
 *   node scripts/capture-parity/run.mjs                   # check against them
 *   node scripts/capture-parity/run.mjs -p fixture -s changed
 *
 * See README.md for the scenario list and the storybook project's prerequisite.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeOutput } from "./lib/normalize.mjs";
import { startStaticServer } from "./lib/static-server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../..");
const CLI = path.join(REPO_ROOT, "packages/cli/bin/cappa.cjs");
const BASELINES = path.join(HERE, "baselines");

/**
 * Each project is a real cappa project plus the few facts the harness needs to
 * drive it: what to serve, on which port the project's own config expects it,
 * and which baselines to disturb for the `changed` / `deleted-baseline` cases.
 */
const PROJECTS = {
  fixture: {
    cwd: path.join(HERE, "projects/fixture"),
    webRoot: path.join(HERE, "projects/fixture/pages"),
    port: 8081,
    env: { CAPPA_PARITY_PORT: "8081" },
    outputDir: ".screenshots",
    filter: "fixture-b*",
    filterNoMatch: "fixture-nothing-*",
    // Overwrite one baseline with another of identical dimensions, so the run
    // reports a genuine pixel change rather than a size mismatch.
    changed: { from: "gamma.png", to: "beta.png" },
    // A baseline with no task behind it any more.
    orphan: { from: "alpha.png", to: "removed-page.png" },
  },
  storybook: {
    cwd: path.join(REPO_ROOT, "examples/storybook"),
    webRoot: path.join(REPO_ROOT, "examples/storybook/storybook-static"),
    port: 8080,
    env: {},
    outputDir: ".screenshots",
    filter: "example-button--*",
    filterNoMatch: "example-nothing--*",
    changed: {
      from: "example/header/loggedout.png",
      to: "example/header/loggedin.png",
    },
    orphan: {
      from: "example/button/large.png",
      to: "example/button/removed.png",
    },
    requires: {
      dir: path.join(REPO_ROOT, "examples/storybook/storybook-static"),
      hint: "pnpm -F @cappa/example-storybook build-storybook",
    },
  },
};

const SCENARIOS = [
  "all-new",
  "all-passed",
  "filter",
  "changed",
  "deleted-baseline",
  "filter-no-match",
];

// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { record: false, projects: null, scenarios: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--record") opts.record = true;
    else if (arg === "--project" || arg === "-p")
      opts.projects = argv[++i].split(",");
    else if (arg === "--scenario" || arg === "-s")
      opts.scenarios = argv[++i].split(",");
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

/** Run the CLI and return its exit code plus stdout and stderr interleaved. */
function runCli(project, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: project.cwd,
      env: {
        ...process.env,
        ...project.env,
        // Colour and TTY-width detection would make the output machine-specific.
        NO_COLOR: "1",
        FORCE_COLOR: "0",
        // `capture` treats CI as "also run onFail", which is a separate path.
        CI: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (c) => {
      output += c;
    });
    child.stderr.on("data", (c) => {
      output += c;
    });
    child.on("close", (code) => resolve({ code: code ?? 0, output }));
  });
}

const outputPath = (project, ...rest) =>
  path.join(project.cwd, project.outputDir, ...rest);

async function reset(project) {
  await rm(outputPath(project), { recursive: true, force: true });
}

/** Capture and approve once, so `expected/` holds a full, passing baseline. */
async function seedBaseline(project) {
  await reset(project);
  const captured = await runCli(project, ["capture"]);
  if (!existsSync(outputPath(project, "actual"))) {
    throw new Error(`seed capture produced nothing:\n${captured.output}`);
  }
  const approved = await runCli(project, ["approve"]);
  if (approved.code !== 0) {
    throw new Error(`seed approve failed:\n${approved.output}`);
  }
}

async function setUpScenario(project, scenario) {
  switch (scenario) {
    case "all-new":
      await reset(project);
      return ["capture"];

    case "all-passed":
      await seedBaseline(project);
      return ["capture"];

    case "filter":
      await seedBaseline(project);
      return ["capture", "--filter", project.filter];

    case "changed": {
      await seedBaseline(project);
      const { from, to } = project.changed;
      await copyFile(
        outputPath(project, "expected", from),
        outputPath(project, "expected", to),
      );
      return ["capture"];
    }

    case "deleted-baseline": {
      await seedBaseline(project);
      const { from, to } = project.orphan;
      await mkdir(path.dirname(outputPath(project, "expected", to)), {
        recursive: true,
      });
      await copyFile(
        outputPath(project, "expected", from),
        outputPath(project, "expected", to),
      );
      return ["capture"];
    }

    case "filter-no-match":
      await seedBaseline(project);
      return ["capture", "--filter", project.filterNoMatch];

    default:
      throw new Error(`unknown scenario: ${scenario}`);
  }
}

async function runScenario(project, scenario) {
  const args = await setUpScenario(project, scenario);
  const { code, output } = await runCli(project, args);
  const normalized = normalizeOutput(output, {
    repoRoot: REPO_ROOT,
    port: project.port,
  });
  return `$ cappa ${args.join(" ")}\n\n${normalized}\n\n--- exit code: ${code}\n`;
}

// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(
      [
        "usage: node scripts/capture-parity/run.mjs [--record] [-p projects] [-s scenarios]",
        "",
        `  projects:  ${Object.keys(PROJECTS).join(", ")}`,
        `  scenarios: ${SCENARIOS.join(", ")}`,
      ].join("\n"),
    );
    return 0;
  }

  if (!existsSync(CLI)) {
    console.error(`CLI not built: ${CLI}\n  run: pnpm build`);
    return 2;
  }

  const projectNames = opts.projects ?? Object.keys(PROJECTS);
  const scenarioNames = opts.scenarios ?? SCENARIOS;
  let failures = 0;

  for (const name of projectNames) {
    const project = PROJECTS[name];
    if (!project) throw new Error(`unknown project: ${name}`);

    if (project.requires && !existsSync(project.requires.dir)) {
      console.error(
        `! ${name}: missing ${path.relative(REPO_ROOT, project.requires.dir)}` +
          `\n    run: ${project.requires.hint}`,
      );
      failures++;
      continue;
    }

    const server = await startStaticServer(project.webRoot, project.port);
    const dir = path.join(BASELINES, name);
    await mkdir(dir, { recursive: true });

    try {
      for (const scenario of scenarioNames) {
        const actual = await runScenario(project, scenario);
        const file = path.join(dir, `${scenario}.txt`);

        if (opts.record) {
          await writeFile(file, actual);
          console.log(`recorded  ${name}/${scenario}`);
          continue;
        }

        const expected = existsSync(file) ? await readFile(file, "utf8") : null;
        if (expected === null) {
          console.error(`MISSING   ${name}/${scenario} (run with --record)`);
          failures++;
        } else if (expected === actual) {
          console.log(`ok        ${name}/${scenario}`);
        } else {
          console.error(`CHANGED   ${name}/${scenario}`);
          await writeFile(`${file}.actual`, actual);
          console.error(
            `          diff: ${path.relative(REPO_ROOT, file)} vs ${path.relative(REPO_ROOT, `${file}.actual`)}`,
          );
          failures++;
        }
      }
    } finally {
      await server.close();
      await reset(project);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} scenario(s) failed`);
    return 1;
  }
  console.log("\nall scenarios match");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(2);
  },
);
