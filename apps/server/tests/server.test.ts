import { expect, it } from "vitest";
import { createServer } from "../src/server";

it("should return ok from health route", async () => {
  const app = await createServer({
    outputDir: "dist/screenshots",
    screenshots: [],
    logger: false,
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/health",
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ ok: true });
});

it("should return config with theme", async () => {
  const app = await createServer({
    outputDir: "dist/screenshots",
    screenshots: [],
    logger: false,
    theme: "dark",
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/config",
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ theme: "dark" });
});

it("should return light theme by default when theme not specified", async () => {
  const app = await createServer({
    outputDir: "dist/screenshots",
    screenshots: [],
    logger: false,
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/config",
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ theme: "light" });
});
