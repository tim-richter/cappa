import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: [
      "@radix-ui/react-dialog",
      "@radix-ui/react-separator",
      "next-themes",
      "nuqs/adapters/react-router/v7",
      "react-dom/client",
      "react-router/dom",
    ],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@ui": fileURLToPath(
        new URL("../../packages/ui/src", import.meta.url),
      ),
    },
  },
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    setupFiles: ["./src/test/setup.ts"],
  },
});
