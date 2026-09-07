// Everything in a capture's output that legitimately varies between two runs of
// the same scenario. Anything NOT listed here is part of the CLI's contract, and
// a diff in it is a real regression rather than noise.
//
// Standard CSI escape sequence: ESC [ ... final-byte. Stripping terminal
// colour genuinely requires matching the ESC control character itself.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ESC is the point
const ANSI_CSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

/**
 * Reduce one capture run's combined stdout/stderr to a form that is stable
 * across machines, checkouts and clock speeds.
 *
 * `repoRoot` and `port` are masked rather than dropped, so a path or URL that
 * moves somewhere it should not still shows up as a diff. Whitespace is left
 * byte-faithful on purpose — consola's box padding is part of the output the
 * parity check is defending.
 */
export function normalizeOutput(raw, { repoRoot, port }) {
  return (
    raw
      .replace(ANSI_CSI, "")
      .replaceAll("\r\n", "\n")
      .replaceAll(repoRoot, "<repo>")
      .replace(
        new RegExp(`http://(?:localhost|127\\.0\\.0\\.1):${port}`, "g"),
        "<base>",
      )
      // "in 4.57s", "in 812ms" — the only numeric-with-unit tokens capture emits.
      .replace(/\b\d+(?:\.\d+)?(?:ms|s)\b/g, "<duration>")
      .trimEnd()
  );
}
