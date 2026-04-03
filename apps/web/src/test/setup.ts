import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

beforeAll(async () => {
  await server.start({ onUnhandledRequest: "warn" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.stop();
});
