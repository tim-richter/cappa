---
"@cappa/server": patch
---

Let the review UI draw a region you type in

A diff report says where something changed — CI logs an interpreted region list, a
colleague quotes a box in a bug report, a design hands you a position and a size — and
until now none of those numbers could be put on the image. The only regions the review UI
could draw were the ones `diff.interpret` produced locally, on a screenshot cappa had just
diffed itself, which is exactly the situation you are not in when you are reading someone
else's report.

**The screenshot header has an Inspect control now** (the crosshair, or the `I` key). Type
a position and a size and the box is drawn over the screenshot, in image pixels — the same
coordinate space a diff report quotes. Add as many regions as you need; each gets its own
colour, kept clear of the `changeType` colours so a typed region and an interpreted one
are never mistakable for each other.

**The box follows you.** It is drawn in every view mode — side by side, toggle, overlay,
split and diff — so you can switch between them with the region fixed on the same content,
and the regions persist as you walk from screenshot to screenshot, because the coordinates
you are chasing rarely belong to the screenshot you are looking at when you get them.

**A region that does not fit the image says so.** Each view reports the image's own pixel
size, and a box that reaches past an edge is drawn dashed and called out in the panel
rather than left to look like a change that moved: coordinates that overflow usually mean
the report was taken at a different viewport or device pixel ratio than the screenshot on
screen, which is worth knowing before you go hunting for something that was never there.

The compare views now scale a screenshot to fit rather than to the panel's height, a
side-effect of pinning the region layer to the image itself: an image taller than the
panel used to be cropped by it, and is now shown whole.
