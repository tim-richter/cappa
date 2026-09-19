import path from "node:path";

/**
 * Screenshot filenames are not a trusted input.
 *
 * A name is whatever a plugin chose, and a plugin may derive it from something
 * it does not control either: `@cappa/plugin-storybook` reads
 * `parameters.cappa.variants[].filename` out of the browser, so the string
 * originates in story-author code. Every name eventually lands in
 * `path.resolve(<bucket dir>, name)`, which honours both absolute paths and
 * `../`, so without a guard a single story could write a PNG anywhere the
 * process can write.
 *
 * Two layers live here: `sanitizeScreenshotFilename` turns a name into a
 * relative path that cannot escape (used where a bad name should degrade rather
 * than fail a run), and `resolveInside` is the hard backstop at the write sink.
 */

/**
 * Whether `target` resolves to something strictly inside `base`.
 *
 * Note this is deliberately stricter than a `startsWith("..")` check on the
 * relative path, which also rejects legitimate names such as `..foo.png`.
 */
export function isPathInside(base: string, target: string): boolean {
  const relative = path.relative(base, target);

  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

/**
 * Resolve `filename` inside `base`, rejecting absolute paths and any name that
 * escapes `base`.
 *
 * @param label - The bucket name used in the error message (`actual`, `diff`, …)
 */
export function resolveInside(
  base: string,
  filename: string,
  label: string,
): string {
  const resolved = path.resolve(base, filename);

  if (path.isAbsolute(filename) || !isPathInside(base, resolved)) {
    throw new Error(
      `Refusing to resolve screenshot path outside of the ${label} directory: ${filename}`,
    );
  }

  return resolved;
}

/**
 * Turn a screenshot filename into a relative path that stays inside its bucket.
 *
 * Path separators are kept — they are how plugins express folders — but
 * traversal (`..`), no-op (`.`) and empty segments are dropped, backslashes are
 * normalised to `/`, and a Windows drive prefix is removed. Returns an empty
 * string when nothing usable is left, which callers treat as "no name given".
 */
export function sanitizeScreenshotFilename(filename: string): string {
  const segments = filename
    // Backslashes are separators on Windows, so `..\\escape.png` traverses there.
    .replace(/\\/g, "/")
    .split("/")
    // A NUL byte would make the eventual `writeFile` throw.
    .map((segment) => segment.replace(/\0/g, "").trim())
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..");

  // `C:foo.png` is drive-relative on Windows, so the drive letter goes too.
  if (segments[0] && /^[a-zA-Z]:$/.test(segments[0])) {
    segments.shift();
  }

  return segments.join("/");
}
