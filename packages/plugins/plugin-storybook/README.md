# Storybook Plugin for Cappa

This plugin allows to take screenshots of Storybook stories with Cappa.

## Install

```bash
pnpm add -D @cappa/plugin-storybook
```

## Usage

Add the plugin to your cappa config:

```ts
import { defineConfig } from "@cappa/core";
import { cappaPluginStorybook } from "@cappa/plugin-storybook";

export default defineConfig({
  plugins: [cappaPluginStorybook({ storybookUrl: "http://localhost:8080" })],
});
```

> Make sure to have a running Storybook server on the given url.

Add the plugin to your storybook config:

```ts
const config: StorybookConfig = {
  addons: ["@cappa/plugin-storybook"],
};
```

Run cappa cli in the directory of your cappa config:

```bash
cappa
```

## Options

## Storybook options

Cappa uses a storybook addon that allows you to pass options from storybook into cappa.

### Parameters

| Option   | Description                                     | Default         |
| -------- | ----------------------------------------------- | --------------- |
| skip     | Whether to skip the screenshot                  | false           |
| delay    | The delay to wait before taking the screenshot  | null (no delay) |
| fullPage | Whether to take a full page screenshot          | true            |
| mask     | An array of selectors to mask in the screenshot | []              |
| omitBackground | Whether to omit the background in the screenshot | false |
| viewport | The viewport to use for the screenshot | null (use default viewport) |
| variants | Additional screenshot variants to capture | [] |
| storybook | Overrides for Storybook rendering (args, globals, view mode, etc.) | {} |

#### Example

```ts
export const Primary: Story = {
  parameters: {
    cappa: {
      skip: true,
      delay: 1000,
      fullPage: false,
      mask: ["#my-element", ".my-class"],
      viewport: { width: 1920, height: 1080 },
      variants: [
        {
          id: "mobile",
          label: "Mobile",
          options: { viewport: { width: 375, height: 812 } },
        },
        {
          id: "tablet",
          options: { viewport: { width: 768, height: 1024 } },
        },
      ],
      storybook: {
        args: { label: "Primary" },
        globals: { locale: "en" },
      },
    },
  },
};
```

You can also provide default Storybook render options for every capture via the plugin configuration:

```ts
export default defineConfig({
  plugins: [
    cappaPluginStorybook({
      storybookUrl: "http://localhost:8080",
      storybook: {
        globals: { locale: "en" },
      },
    }),
  ],
});
```

Each variant captures an additional screenshot using the provided options. Variants inherit the base configuration by default,
so you can override only the properties that should differ (for example, a viewport or an additional delay). Variant filenames
are generated automatically using the pattern `<base-name>--<variant-id>.png`, but you can supply a custom `filename` if you
need to control the output path.

## Flakiness

To avoid flakiness, cappa disables css animations and transitions by default. For additional use cases or animation libraries, you can use the `isCappa` function to check if the current window is a cappa window. You can use it inside of your storybook preview file (`.storybook/preview.ts`):

```ts
import { isCappa } from '@cappa/plugin-storybook/browser';

if (isCappa()) {
  import("disable-animations.css");
  MotionGlobalConfig.disableAnimations = true;
}
```

### DOM Mutations

Cappa waits for DOM mutations to be idle before taking the screenshot. It does so by querying the DOM for mutations and waiting for a certain amount of time to pass, until the page is considered idle.

### Fonts & Images

Cappa waits for fonts and images to be loaded before taking the screenshot.

### SVG's

Cappa sets global css styles to render svg images more consistently. You might experience
differences between actual browsers and cappa screenshots, but that is expected and wanted behavior, since browsers tend to render svg images differently.
