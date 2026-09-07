/**
 * Parity fixture — a self-contained project driving a hand-written plugin over
 * four local HTML pages.
 *
 * Deliberately imports nothing: the harness runs the CLI binary directly and
 * this directory is outside the pnpm workspace, so the config must stand on its
 * own. `defineConfig` is only a type helper, and the plugin contract
 * (`name` / `description` / `discover` / `execute`) is small enough to satisfy
 * by hand — which is the point. It exercises the raw plugin API rather than a
 * shipped plugin's behaviour, so a parity diff here points at the CLI.
 */

// Fixed, and matched by the harness: this is the port `run.mjs` serves
// `pages/` on. Hard-coded rather than read from the environment so the
// project stays runnable by hand.
const BASE_URL = "http://127.0.0.1:8081";

const PAGES = ["alpha", "beta", "gamma", "delta"];

const fixturePlugin = () => ({
  name: "FixturePlugin",
  description: "Takes screenshots of the parity fixture's local pages",

  discover: async () =>
    PAGES.map((name) => ({
      id: `fixture-${name}`,
      url: `${BASE_URL}/${name}.html`,
      data: { name },
    })),

  execute: async (task: any, page: any, screenshotTool: any) => {
    const filename = `${task.data.name}.png`;

    const result = await screenshotTool.captureWithVariants(
      page,
      filename,
      task.url,
      { fullPage: true, viewport: screenshotTool.viewport },
      [],
      { saveDiffImage: true, diffImageFilename: filename },
    );

    const { base } = result;

    // Mirrors the result shape of both shipped plugins exactly, including
    // `success: false` for a screenshot with no baseline — that is what makes
    // an all-new run a *failure* the CLI reports, and the parity check would be
    // worth much less if this fixture disagreed with the real plugins here.
    return {
      name: task.data.name,
      url: task.url,
      filepath: base.filepath,
      success: base.skipped
        ? undefined
        : base.comparisonResult
          ? base.comparisonResult.passed
          : false,
      isNew: !base.skipped && !base.comparisonResult ? true : undefined,
      skipped: base.skipped,
    };
  },
});

export default {
  outputDir: ".screenshots",
  concurrency: 1,
  diff: {
    threshold: 0.1,
    includeAA: false,
    fastBufferCheck: true,
    maxDiffPixels: 0,
    maxDiffPercentage: 0,
  },
  plugins: [fixturePlugin()],
};
