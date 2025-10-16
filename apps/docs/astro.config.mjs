import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://tim-richter.github.io",
  base: "/cappa",
  integrations: [
    starlight({
      title: "Cappa",
      description:
        "Learn how to capture, review, and approve visual regressions with Cappa.",
      sidebar: [
        {
          label: "Overview",
          items: [
            { label: "Introduction", link: "/" },
            { label: "Quickstart", link: "/quickstart" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "CLI", link: "/cli" },
            { label: "Configuration", link: "/configuration" },
          ],
        },
        {
          label: "Plugins",
          items: [
            { label: "Storybook", link: "/storybook" },
            { label: "Custom Plugins", link: "/custom-plugins" },
          ],
        },
      ],
      social: [
        {
          label: "GitHub",
          icon: "github",
          href: "https://github.com/tim-richter/cappa",
        },
      ],
    }),
  ],
});
