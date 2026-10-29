# cappa — judging changes

Used when `cappa agent check --json` reports `pendingJudgments > 0`: the heuristic labelled those
changes `ambiguous` and is deferring to you — or you asked for every change with `--judge all`.

## Who judges
If the `cappa-judge` subagent is installed (`cappa agent init` adds it for Claude Code and
OpenCode), hand it the pending screenshots — always, even one, and even if you can read images.
It may be pinned to a different model than yours because yours cannot read images, and you
cannot reliably tell that yourself. It also keeps the crops out of your context. It follows this
file and records verdicts with `cappa agent judge`; use what it records. If it replies that it
cannot read images, pass that on to the user and stop.

Each judgment means two images, so one judge cannot take hundreds. Give a judge at most about 20
screenshots — fewer when they have many regions — and start several judges in parallel for the
rest, each with its own names. Keep screenshots that share a `verdict.headline` (below) with the
same judge, so it can judge them in one call.

Only without `cappa-judge` do you judge yourself, by this file. If your model cannot read images,
hand the `judgment` directories to any subagent whose model can. Never substitute your own
tooling (no ImageMagick, no manual crops, no pixel statistics) and never judge blind.

## Judge everything that is pending
A request stays pending through every later check until it has a verdict. After `--judge all`
that includes changes whose heuristic label you agree with — record those too (one call per
shared label), or `pendingJudgments` never reaches 0.

## Look for one shared cause first
Before opening anything, group the pending `results[]` by `verdict.headline`. Headlines are built so
that the same kind of change produces the same text — `1 content-change @ bottom-right (0.02%, low)`
across many screenshots is almost certainly one shared element (footer date, version badge,
theme toggle, a shared component everyone renders). Open one or two from the group to confirm,
then fix or mask it once at the source (`MASKING.md`) instead of writing N identical verdicts.

## Judge each remaining change
For each pending entry, in its `judgment` directory:

1. Read `request.json`: `regions[]` (bbox, pixelCount, changeType, position — largest first),
   `heuristic`, `summary`, and `paths`.
2. **Read `locator.png` and `regions.png` together, in one parallel batch** — and batch across
   entries too. `locator.png` is a thumbnail with every region outlined and numbered;
   `regions.png` stacks one `#n expected | #n actual` row per region, in `regions[]` order, with
   context around each change.
3. When the image dimensions changed there are no regions: read `overview.png` (expected and actual
   scaled side by side, at the same scale) instead. Page height changes are usually intended
   content changes; confirm that the content delta matches a code change.
4. Only open `paths.expected` / `paths.actual` / `paths.diff` (full size) when a change clearly
   continues outside its crop.
5. You have the source code — use it. A diff that lines up with a change in the working tree or a
   recent commit is evidence of intent; one with no code change behind it is evidence of noise
   or a regression elsewhere. The heuristic's label is one more signal, not the answer: it calls
   structural changes `regression-likely` even when they were made on purpose.

Labels:
- `regression-likely` — broken, missing, clipped, overlapping, misaligned, wrong data, truncated
  text, or an unintended side effect of an unrelated change.
- `intentional-likely` — a deliberate content or style change consistent with the code.
- `noise-likely` — anti-aliasing, sub-pixel text rendering, non-deterministic content.

## Record the verdict
With `cappa agent judge` — it validates the verdict, and takes several names for one shared
cause. Don't write `verdict.json` by hand.
```sh
cappa agent judge <name> [<name> ...] --label <label> --headline "<one line>" \
  [--rationale "<reason>" ...] [--confidence 0.8] --json
```
For example: `--label regression-likely --headline "Submit button label is truncated"
--rationale "'Submit' renders as 'Subm' in region #3" --confidence 0.9`.

Then re-run `cappa agent check --json` and continue with step 3 of `SKILL.md`. A verdict whose
`verdictError` is set was rejected — fix it and re-check.

## Shell loops
Prefer one `cappa agent judge` call with several names over a loop. If you must loop, don't rely on
word-splitting a variable (zsh, the macOS default, does not split): use
`while IFS= read -r name; do ...; done <<'EOF'` with one name per line.
