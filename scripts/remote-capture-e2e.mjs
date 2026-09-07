#!/usr/bin/env node
/**
 * End-to-end check for remote capture.
 *
 * Two ports standing in for two machines: `cappa serve` on one, `cappa capture
 * --server` on the other, both against the parity fixture project. Everything
 * here is the real CLI over a real socket driving a real browser — the point is
 * to exercise what unit tests mock away.
 *
 *   pnpm build && node scripts/remote-capture-e2e.mjs
 *
 * Exits non-zero on the first failed expectation.
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./capture-parity/lib/static-server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const CLI = path.join(REPO_ROOT, "packages/cli/bin/cappa.cjs");
const PROJECT = path.join(HERE, "capture-parity/projects/fixture");
const PAGES = path.join(PROJECT, "pages");
const OUTPUT = path.join(PROJECT, ".screenshots");

const PAGES_PORT = 8081; // the fixture's own config points here
const HOST_PORT = 4600;
const READ_ONLY_PORT = 4601;
const TOKEN = "e2e-secret-token";

const HOST_URL = `http://127.0.0.1:${HOST_PORT}`;
const READ_ONLY_URL = `http://127.0.0.1:${READ_ONLY_PORT}`;

let failures = 0;

const check = (name, condition, detail) => {
  if (condition) {
    console.log(`ok    ${name}`);
    return;
  }
  failures++;
  console.error(`FAIL  ${name}`);
  if (detail) {
    console.error(
      detail
        .split("\n")
        .map((line) => `        ${line}`)
        .join("\n"),
    );
  }
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Run the CLI to completion and return its exit code and combined output. */
const runCli = (args, env = {}) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: PROJECT,
      env: { ...process.env, NO_COLOR: "1", CI: "", ...env },
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

/** Start a long-lived CLI process and hand back a handle to it. */
const startCli = (args, env = {}) => {
  const child = spawn(process.execPath, [CLI, ...args], {
    cwd: PROJECT,
    env: { ...process.env, NO_COLOR: "1", CI: "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const handle = {
    child,
    output: "",
    exitCode: /** @type {number | undefined} */ (undefined),
    exited: new Promise((resolve) => {
      child.on("close", (code) => {
        handle.exitCode = code ?? 0;
        resolve(code ?? 0);
      });
    }),
  };

  child.stdout.on("data", (c) => {
    handle.output += c;
  });
  child.stderr.on("data", (c) => {
    handle.output += c;
  });

  return handle;
};

const waitForHealth = async (url, token) => {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${url}/api/health`, {
        headers: token ? { "x-cappa-token": token } : {},
      });
      if (response.ok) {
        return true;
      }
    } catch {
      // not up yet
    }
    await wait(250);
  }
  return false;
};

const main = async () => {
  if (!existsSync(CLI)) {
    console.error(`CLI not built: ${CLI}\n  run: pnpm build`);
    return 2;
  }

  rmSync(OUTPUT, { recursive: true, force: true });

  const pages = await startStaticServer(PAGES, PAGES_PORT);

  // Two "machines": one hosting a capture engine, one read-only.
  const host = startCli(["serve", "--port", String(HOST_PORT), "--no-ui"], {
    CAPPA_TOKEN: TOKEN,
  });
  const readOnlyHost = startCli([
    "serve",
    "--port",
    String(READ_ONLY_PORT),
    "--no-ui",
    "--read-only",
  ]);

  try {
    check("host comes up", await waitForHealth(HOST_URL, TOKEN), host.output);
    check(
      "read-only host comes up",
      await waitForHealth(READ_ONLY_URL),
      readOnlyHost.output,
    );

    check(
      "host reads CAPPA_TOKEN and reports it",
      host.output.includes("token=yes"),
      host.output,
    );

    // --- a full remote run, all new -------------------------------------
    const firstRun = await runCli(["capture", "--server", HOST_URL], {
      CAPPA_TOKEN: TOKEN,
    });

    check("remote capture exits 1 on new screenshots", firstRun.code === 1);
    check(
      "remote capture streams live task progress",
      /\[1\/4\] captured fixture-/.test(firstRun.output),
      firstRun.output,
    );
    check(
      "remote capture prints the failure report",
      firstRun.output.includes("Failed Screenshots") &&
        firstRun.output.includes("Total failures: 4"),
      firstRun.output,
    );
    check(
      "remote capture names the host's config",
      firstRun.output.includes("uses its own cappa.config.ts"),
      firstRun.output,
    );
    check(
      "the host wrote the screenshots",
      existsSync(path.join(OUTPUT, "actual/alpha.png")),
    );
    check(
      "the host's own capture commentary reaches the client",
      // `ScreenshotTool` writes this straight to its logger. It only reaches a
      // remote client because `CaptureRunner` routes the tool's output through
      // the run's event stream — without that it stays in the host's terminal.
      /Screenshot saved: .*alpha\.png/.test(firstRun.output),
      firstRun.output,
    );

    // --- approve, then a clean remote run --------------------------------
    await runCli(["approve"]);
    const cleanRun = await runCli(["capture", "--server", HOST_URL], {
      CAPPA_TOKEN: TOKEN,
    });

    check("remote capture exits 0 when everything passes", cleanRun.code === 0);
    check(
      "remote capture reports success",
      cleanRun.output.includes("All plugins completed successfully"),
      cleanRun.output,
    );

    // --- a failing remote run --------------------------------------------
    copyFileSync(
      path.join(OUTPUT, "expected/gamma.png"),
      path.join(OUTPUT, "expected/beta.png"),
    );
    const failingRun = await runCli(["capture", "--server", HOST_URL], {
      CAPPA_TOKEN: TOKEN,
    });

    check("a failing remote run exits 1", failingRun.code === 1);
    check(
      "a failing remote run reports the changed screenshot",
      failingRun.output.includes("Changed Screenshots") &&
        failingRun.output.includes("beta"),
      failingRun.output,
    );

    // --- pre-flight failures ----------------------------------------------
    const badToken = await runCli([
      "capture",
      "--server",
      HOST_URL,
      "--token",
      "wrong",
    ]);
    check(
      "a wrong token is refused at pre-flight",
      badToken.code === 1 &&
        badToken.output.includes("rejected the access token"),
      badToken.output,
    );

    const unreachable = await runCli([
      "capture",
      "--server",
      "http://127.0.0.1:1",
    ]);
    check(
      "an unreachable host is reported distinctly",
      unreachable.code === 1 &&
        unreachable.output.includes("Could not reach a cappa server"),
      unreachable.output,
    );

    const readOnly = await runCli(["capture", "--server", READ_ONLY_URL]);
    check(
      "a read-only host is refused at pre-flight",
      readOnly.code === 1 && readOnly.output.includes("read-only"),
      readOnly.output,
    );

    // --- one run at a time -------------------------------------------------
    const [raceA, raceB] = await Promise.all([
      runCli(["capture", "--server", HOST_URL], { CAPPA_TOKEN: TOKEN }),
      runCli(["capture", "--server", HOST_URL], { CAPPA_TOKEN: TOKEN }),
    ]);
    const conflicted = [raceA, raceB].filter((run) =>
      run.output.includes("is already running a capture"),
    );
    check(
      "a concurrent run is refused with a message, not a stack trace",
      conflicted.length === 1 &&
        !conflicted[0].output.includes("at RemoteEngine"),
      `${raceA.output}\n---\n${raceB.output}`,
    );

    // --- cancellation ------------------------------------------------------
    // The fixture captures four pages in well under a second, so interrupting
    // on a fixed delay races the run to completion. Poll for a live run and
    // signal the moment there is one to cancel.
    const interrupted = startCli(["capture", "--server", HOST_URL], {
      CAPPA_TOKEN: TOKEN,
    });

    const signalled = await (async () => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const active = await fetch(`${HOST_URL}/api/runs`, {
          headers: { "x-cappa-token": TOKEN },
        })
          .then((response) => response.json())
          .then((runs) =>
            runs.find(
              (run) => run.state === "running" || run.state === "discovering",
            ),
          )
          .catch(() => undefined);

        if (active) {
          interrupted.child.kill("SIGINT");
          return true;
        }
        await wait(20);
      }
      return false;
    })();

    check("a run was in flight to interrupt", signalled, interrupted.output);
    await interrupted.exited;

    check(
      "Ctrl-C exits 130",
      interrupted.exitCode === 130,
      `exit=${interrupted.exitCode}\n${interrupted.output}`,
    );
    check(
      "Ctrl-C says it is cancelling the remote run",
      interrupted.output.includes("Cancelling the remote run"),
      interrupted.output,
    );

    const runs = await fetch(`${HOST_URL}/api/runs`, {
      headers: { "x-cappa-token": TOKEN },
    }).then((response) => response.json());
    check(
      "the host actually stopped the cancelled run",
      runs[0]?.state === "cancelled",
      JSON.stringify(runs[0], null, 2),
    );
  } finally {
    // --- clean shutdown ----------------------------------------------------
    host.child.kill("SIGTERM");
    readOnlyHost.child.kill("SIGTERM");
    await Promise.all([host.exited, readOnlyHost.exited]);
    await pages.close();
    rmSync(OUTPUT, { recursive: true, force: true });
  }

  const countBrowsers = () =>
    new Promise((resolve) => {
      const ps = spawn("sh", [
        "-c",
        "ps -eo args | grep -c '[h]eadless_shell\\|[c]hrome-headless-shell' || true",
      ]);
      let out = "";
      ps.stdout.on("data", (c) => {
        out += c;
      });
      ps.on("close", () => resolve(Number(out.trim()) || 0));
    });

  // A browser tree takes a moment to actually disappear after its parent exits,
  // so give it one — a leak stays leaked, a dying process does not.
  let browsers = await countBrowsers();
  for (let attempt = 0; attempt < 20 && browsers > 0; attempt++) {
    await wait(250);
    browsers = await countBrowsers();
  }

  check(
    "SIGTERM'd hosts leave no orphaned browser processes",
    browsers === 0,
    `${browsers} chromium process(es) still running`,
  );

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    return 1;
  }
  console.log("\nall checks passed");
  return 0;
};

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(2);
  },
);
