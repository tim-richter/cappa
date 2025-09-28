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
