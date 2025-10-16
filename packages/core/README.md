# Core Package

This package contains the core functionality for Cappa.

It is the foundation of the Cappa CLI and server.
It wraps the Playwright API and provides a set of helpers for capturing screenshots.

It also provides an api to interact with the local files system to store the screenshots.

## Example

```ts
import { ScreenshotTool } from "@cappa/core";

const screenshotTool = new ScreenshotTool();

screenshotTool.capture(page, "my-page", {
  fullPage: true,
});
```