---
"@cappa/core": minor
"@cappa/protocol": minor
"@cappa/cli": minor
"@cappa/server": minor
---

Screenshots remember the pixel ratio they were captured at. A screenshot taken with `scale: 'device'` carries its ratio in the PNG (a `cappa:pixelRatio` text chunk plus a standard `pHYs` DPI chunk); 1× screenshots are unchanged. `Screenshot` gains `actualPixelRatio` / `expectedPixelRatio` (absent means 1), read back by `collectScreenshots` and carried by the protocol.

A baseline captured at another ratio now fails at once instead of retrying, with an error that names both ratios; `cappa capture` and `cappa status` mark it `1× → 2×`. The review UI shows every image at its CSS size, so 2× screenshots are no longer displayed at twice their size and a baseline and capture of different ratios line up, with a notice explaining the mismatch.
