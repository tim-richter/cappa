# Cappa — Storybook plugin

Visual regression testing for Storybook, powered by [Cappa](https://github.com/tim-richter/cappa)
and Playwright.

The plugin fetches every story from a running Storybook, opens it in Playwright, and captures a
screenshot. Cappa then diffs each capture against an approved baseline and gives you a local review
UI to approve or reject the changes. No SaaS account, no upload — everything stays on your machine
and in your repo.

- **Story-aware** — reads the Storybook index, so new stories are picked up automatically
- **Per-story configuration** via `parameters.cappa` (delay, masks, viewport, full page, diff
  thresholds)
- **Variants** — capture the same story multiple times with different viewports or args
- **Play functions** — waits for `play` to finish before capturing, so you can screenshot
  interactive states
- **Pixel and perceptual (GMSD) diffing**, configurable globally or per story
- **Local review UI** — `cappa review` to inspect diffs, `cappa approve` to update baselines

## Installation

```bash
npm install -D @cappa/cli @cappa/plugin-storybook
```

## Setup

### 1. Register the plugin in `cappa.config.ts`

```ts
import { defineConfig } from '@cappa/core';
import { cappaPluginStorybook } from '@cappa/plugin-storybook';

export default defineConfig({
  outputDir: 'screenshots',
  plugins: [
    cappaPluginStorybook({
      storybookUrl: 'http://localhost:6006',
    }),
  ],
});
```

### 2. Register the addon in `.storybook/main.ts`

The addon exposes each story's `parameters.cappa` to the capture pipeline.

```ts
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  addons: ['@cappa/plugin-storybook'],
};

export default config;
```

### 3. Capture

Start Storybook, then run the capture in a second terminal:

```bash
# Terminal 1
npm run storybook

# Terminal 2
npx cappa capture
```

Then `npx cappa review` to inspect the diffs and `npx cappa approve` to promote the new screenshots
to baselines.

> For faster and more stable runs, build Storybook first and serve the static output instead of using
> the dev server.

## Plugin options

| Option | Description |
| --- | --- |
| `storybookUrl` | URL of the running Storybook instance (required) |
| `includeStories` | Predicate `(story) => boolean`; only matching stories are captured |
| `excludeStories` | Predicate `(story) => boolean`; applied after `includeStories` |
| `defaultViewport` | Fallback viewport when a story does not define its own |
| `waitForSelector` | Wait for a selector to appear before capturing |
| `waitForTimeout` | Extra wait (ms) before capturing |

## Per-story options

```ts
export const Primary = {
  parameters: {
    cappa: {
      delay: 250,
      mask: ['.tooltip'],
      variants: [
        {
          id: 'mobile',
          label: 'Mobile',
          options: { viewport: { width: 375, height: 812 } },
        },
      ],
    },
  },
};
```

Supported keys: `skip`, `delay`, `fullPage`, `mask`, `omitBackground`, `viewport`, `variants` and
`diff`.

To detect a Cappa run from inside the browser (to disable animations, seed mock data, …):

```ts
import { isCappa } from '@cappa/plugin-storybook/browser';

if (isCappa()) {
  // ...
}
```

## Compatibility

Storybook `^9 || ^10`, any renderer that runs in a browser (React, Vue, Angular, Svelte, Preact,
Web Components, Ember, HTML). React Native is not supported.

## Documentation

Full documentation: <https://tim-richter.github.io/cappa/storybook>

## License

MIT © Tim Richter
