# cappa — judging changes

Used when `cappa agent check --json` reports `pendingJudgments > 0`: every changed screenshot
waits for a judge, and nothing has labelled it before you look. Cappa's diff threshold already
filters sub-pixel rendering, so assume each change is real until the images show otherwise.

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
A request stays pending through every later check until it has a verdict, so `pendingJudgments`
only reaches 0 when every changed screenshot is judged. Several screenshots with one shared cause
take one `cappa agent judge` call.

## Look for one shared cause first
Before opening anything, group the pending `results[]` by `change`. It is built so that the same
change produces the same text — `1 region @ bottom-right (0.02%)` across many screenshots is
likely one shared element (footer date, version badge, theme toggle, a shared component everyone
renders). Open two or three from the group to confirm they really show the same change, then fix
or mask it once at the source (`MASKING.md`) instead of writing N identical verdicts. A matching
`change` line is a hint, not evidence: judge every screenshot you have not confirmed.

## Judge each remaining change
For each pending entry, in its `judgment` directory:

1. Read `request.json`: `change`, `regions[]` (bbox, pixelCount, position, shape — largest
   first), `dimensions` and `paths`. It says where pixels differ, not what kind of change it is —
   that is for you to see.
2. **Read `locator.png` and `regions.png` together, in one parallel batch** — and batch across
   entries too. `locator.png` is a thumbnail with every region outlined and numbered;
   `regions.png` stacks one `#n expected | #n actual` row per region, in `regions[]` order, with
   context around each change.
3. When the image dimensions changed (headline starts with `dimensions changed;`, or is
   `image dimensions changed`), also read `overview.png`: expected and actual whole, side by side,
   at the same scale. Regions are then located on a canvas padded to the larger size, anchored
   top-left — in a crop, area only one image covers is empty. With no regions, only the size
   changed (whitespace grew or shrank). Size changes are usually intended content changes;
   confirm that the content delta matches a code change.
4. Compare sizes and positions, not just content. A font that is larger, smaller or bolder,
   text that wraps or truncates differently, and padding, gaps or alignment that moved are easy
   to dismiss as rendering noise in a crop — check glyph heights, line counts and edges against
   each other in the `expected | actual` pair.
5. Only open `paths.expected` / `paths.actual` / `paths.diff` (full size) when a change clearly
   continues outside its crop.
6. Then use the source code. A change that lines up with a change in the working tree or a recent
   commit is evidence of intent — but only for what that code change should do: a button
   restyle that also shrinks the heading next to it is a regression. A change with no code
   change behind it is a regression elsewhere or non-deterministic content. Never let the code
   diff stand in for looking.

Labels:
- `regression-likely` — broken, missing, clipped, overlapping, misaligned, wrong data, truncated
  text, or an unintended side effect of an unrelated change.
- `intentional-likely` — a deliberate content or style change consistent with the code.
- `noise-likely` — non-deterministic content (clock, random data, animation frame) or rendering
  differences you can see are invisible to a user. Rare: the diff threshold already filters
  sub-pixel rendering, so do not reach for this label because a change is small.

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
