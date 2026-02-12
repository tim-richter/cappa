import type { Preview } from "@storybook/react-vite";
import { initialize, mswLoader } from "msw-storybook-addon";
import "../src/index.css";
import { MemoryRouter } from "react-router";
import { handlers } from "../src/mocks/screenshots";
import { Providers } from "../src/Providers";

initialize({ onUnhandledRequest: "bypass" }, handlers);

const preview: Preview = {
  loaders: [mswLoader],
  globalTypes: {
    theme: {
      description: "Theme for the review UI",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    msw: {
      handlers: { api: handlers },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme ?? "light";
      const useRouterProvider =
        (context.parameters?.useRouterProvider as boolean) ?? false;

      return (
        <div className={theme === "dark" ? "dark" : undefined}>
          <Providers>
            {useRouterProvider ? (
              <Story />
            ) : (
              <MemoryRouter>
                <Story />
              </MemoryRouter>
            )}
          </Providers>
        </div>
      );
    },
  ],
};

export default preview;
