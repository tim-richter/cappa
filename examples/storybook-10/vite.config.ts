/// <reference types="vitest/config" />

// https://vite.dev/config/
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
});
