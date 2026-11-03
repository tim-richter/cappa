---
"@cappa/core": minor
---

Screenshots whose size changed are now actually diffed. Before, a size mismatch returned no pixel count, a 200×200 red placeholder as the diff image, and no regions for agent review. Both images are now compared on a canvas padded to the larger width and height, anchored top-left, with each image padded with its own edge background. Only real content in the grown area counts, so a list that gained an item diffs as that item. A size change still never passes.

- Pixel and GMSD comparisons return a real diff image for size changes. Pixel results also carry `dimensions` and, with `diff.interpret`, an interpretation.
- `cappa agent check` locates regions for size changes and renders `locator.png` and `regions.png` next to `overview.png`. The headline starts with `dimensions changed;`, and a size change is never labelled `noise-likely`.
- The `noise-likely` sub-perceptual rule now uses an absolute pixel count (`SUB_PERCEPTUAL_PIXELS = 25`) instead of a share of the image, so the same change gets the same label in a tight crop and in a 1920×1080 capture. `SUB_PERCEPTUAL_PERCENT` is replaced by `SUB_PERCEPTUAL_PIXELS`.
