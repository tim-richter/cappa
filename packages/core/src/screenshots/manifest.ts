import fsp from "node:fs/promises";
import path from "node:path";

/**
 * Maps a screenshot back to the capture task that produced it.
 *
 * Nothing on disk carries this. A screenshot's name comes from the filename a
 * plugin chose (`example/button/primary`), while the task id comes from the
 * plugin's own addressing scheme (`example-button--primary` for Storybook) —
 * and there is no rule connecting the two. Without a record written at capture
 * time, "re-capture this one screenshot" has no task to ask for, which is
 * exactly how the review UI's re-capture button came to send a name the engine
 * had never heard of.
 *
 * Kept beside `actual/` and `expected/` rather than inside them so it is never
 * mistaken for a screenshot, and dot-prefixed so `@fastify/static` (which is
 * configured with `serveDotFiles: false`) will not serve it.
 */
export const MANIFEST_FILENAME = ".cappa-manifest.json";

/** Bumped only if the on-disk shape changes incompatibly. */
export const MANIFEST_VERSION = 1;

/** Where a screenshot came from. */
export type ScreenshotOrigin = {
  /** Task id as `discover` produced it — what `startRun` accepts. */
  taskId: string;
  /** Plugin that owns the task. */
  plugin: string;
};

export type CaptureManifest = {
  version: number;
  /** Keyed by screenshot name (relative path, no `.png`). */
  screenshots: Record<string, ScreenshotOrigin>;
};

export const emptyManifest = (): CaptureManifest => ({
  version: MANIFEST_VERSION,
  screenshots: {},
});

export const manifestPath = (outputDir: string): string =>
  path.resolve(outputDir, MANIFEST_FILENAME);

/**
 * The key a capture filename is recorded under.
 *
 * Must match the `name` `groupScreenshots` derives, or a lookup silently
 * misses: the relative path with its `.png` dropped, and separators normalised
 * so a manifest written on Windows is readable on Linux.
 */
export const toManifestKey = (filename: string): string =>
  filename
    .split(path.sep)
    .join("/")
    .replace(/\.png$/i, "");

const isOrigin = (value: unknown): value is ScreenshotOrigin =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ScreenshotOrigin).taskId === "string" &&
  typeof (value as ScreenshotOrigin).plugin === "string";

/**
 * Read the manifest, or an empty one.
 *
 * Never throws: the manifest is an optimisation, and a missing, truncated or
 * hand-edited file must degrade to "we do not know where this came from"
 * rather than break the screenshot index every command depends on.
 */
export const readCaptureManifest = async (
  outputDir: string,
): Promise<CaptureManifest> => {
  try {
    const raw = await fsp.readFile(manifestPath(outputDir), "utf8");
    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as CaptureManifest).version !== MANIFEST_VERSION
    ) {
      return emptyManifest();
    }

    const screenshots = (parsed as CaptureManifest).screenshots;
    if (typeof screenshots !== "object" || screenshots === null) {
      return emptyManifest();
    }

    const entries = Object.entries(screenshots).filter(([, origin]) =>
      isOrigin(origin),
    );

    return {
      version: MANIFEST_VERSION,
      screenshots: Object.fromEntries(entries) as Record<
        string,
        ScreenshotOrigin
      >,
    };
  } catch {
    return emptyManifest();
  }
};

/**
 * Merge freshly captured origins into whatever the manifest already holds.
 *
 * A run only captures the tasks it was asked for, so existing entries have to
 * survive — otherwise re-capturing one screenshot would strip every other
 * screenshot's origin and disable the button that started it.
 *
 * `knownNames`, when given, is the set of screenshots that currently exist;
 * entries outside it are dropped so renames and deletions do not accumulate
 * forever. New origins are always kept, whether or not they appear in it.
 */
export const mergeCaptureManifest = (
  existing: CaptureManifest,
  origins: Record<string, ScreenshotOrigin>,
  knownNames?: Iterable<string>,
): CaptureManifest => {
  const keep = knownNames ? new Set(knownNames) : undefined;

  const merged: Record<string, ScreenshotOrigin> = {};

  for (const [name, origin] of Object.entries(existing.screenshots)) {
    if (!keep || keep.has(name)) {
      merged[name] = origin;
    }
  }

  for (const [name, origin] of Object.entries(origins)) {
    merged[name] = origin;
  }

  return { version: MANIFEST_VERSION, screenshots: merged };
};

/**
 * Persist `origins`, merged over what is already recorded.
 *
 * Best-effort by design: a read-only or full disk must not turn a successful
 * capture run into a failed one, so a write failure is reported to the caller
 * as `false` rather than thrown.
 */
export const recordCaptureOrigins = async (
  outputDir: string,
  origins: Record<string, ScreenshotOrigin>,
  knownNames?: Iterable<string>,
): Promise<boolean> => {
  try {
    const merged = mergeCaptureManifest(
      await readCaptureManifest(outputDir),
      origins,
      knownNames,
    );

    await fsp.mkdir(path.resolve(outputDir), { recursive: true });
    await fsp.writeFile(
      manifestPath(outputDir),
      `${JSON.stringify(merged, null, 2)}\n`,
      "utf8",
    );

    return true;
  } catch {
    return false;
  }
};
