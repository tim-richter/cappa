import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://tim-richter.github.io",
  base: "/cappa",
  integrations: [
    starlight({
      title: "Cappa Documentation",
      description:
        "Learn how to capture, review, and approve visual regressions with Cappa.",
      sidebar: [
        {
          label: "Overview",
          items: [
            { label: "Introduction", link: "/introduction" },
            { label: "Quickstart", link: "/quickstart" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "CLI Workflow", link: "/cli-workflow" },
            { label: "Configuration", link: "/configuration" },
            { label: "Plugins", link: "/plugins" },
          ],
        },
      ],
      social: {
        github: "https://github.com/cappajs/cappa",
      },
    }),
  ],
});
