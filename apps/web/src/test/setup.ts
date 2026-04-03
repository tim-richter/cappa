import { setupWorker } from "msw/browser";
import { afterAll, afterEach, beforeAll } from "vitest";
import { handlers } from "../mocks/screenshots";

export const server = setupWorker(...handlers);

beforeAll(async () => {
  await server.start({ onUnhandledRequest: "warn" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.stop();
});
