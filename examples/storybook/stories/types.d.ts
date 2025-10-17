import type { CappaStorybookOptions } from "@cappa/plugin-storybook";
import "@storybook/react-vite";

declare module "@storybook/react-vite" {
  interface Parameters {
    cappa?: CappaStorybookOptions;
  }
}
