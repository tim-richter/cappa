<p align="center">
  <img height="150" alt="cappa" src="https://github.com/user-attachments/assets/70683ad3-4a57-46b2-b829-16ec25b4ac94" />
</p>


<h1 align="center">
Cappa
</h1>
<p align="center">
Playwright-based screenshot tool
<p>

<br>
<br>

## Install

```bash
pnpm add -D @cappa/cli @cappa/core
```

### Playwright

Cappa uses Playwright to take screenshots, but it does not automatically install the browsers. To install the browsers, you can run the following command:

```bash
npx playwright install --with-deps
```

## Usage

Create a cappa.config.ts file in the root of your project:

```ts
import { defineConfig } from "@cappa/core";

export default defineConfig({
  outputDir: "screenshots",
});
```

Run the cli:

```bash
# capture screenshots with playwright
cappa capture

# review screenshots
cappa review

# approve screenshots
cappa approve

# get status of screenshots (folder)
cappa status
```

## Plugins

Cappa has a plugin system that allows you to add new features and connectors to tools like Storybook.

[Storybook Plugin](packages/plugins/plugin-storybook/README.md)

## Options

| Option              | Description | Default  |
|---------------------|-------------|----------|
| -l, --log-level     | Log level   | 3 (info) |

## Screenshot retries

Cappa automatically retries a screenshot comparison when the pixels differ from
the saved baseline so transient rendering hiccups do not block your pipeline.
The retry budget defaults to two attempts, uses incremental backoff between
tries, and honours any delay configured for the screenshot. Read the
["Screenshot retries" guide](apps/docs/src/content/docs/screenshot-retries.mdx)
to learn how the loop works and how to customise it in `cappa.config.ts`.
