import type { Preview } from "@storybook/react-vite";
import "../src/index.css";
import { MemoryRouter } from "react-router";
import { Providers } from "../src/Providers";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    (Story) => {
      return (
        <Providers>
          <MemoryRouter>
            <Story />
          </MemoryRouter>
        </Providers>
      );
    },
  ],
};

export default preview;
