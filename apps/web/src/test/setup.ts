import { toast } from "@ui/lib/utils";
import { setupWorker } from "msw/browser";
import { afterAll, afterEach, beforeAll } from "vitest";
import { handlers } from "../mocks/screenshots";

export const server = setupWorker(...handlers);

beforeAll(async () => {
  await server.start({ onUnhandledRequest: "warn", quiet: true });
});

afterEach(() => {
  server.resetHandlers();
  // Sonner keeps one global toast list, so a toast raised by one test is still
  // on screen in the next one unless it is cleared here.
  toast.dismiss();
});

afterAll(() => {
  server.stop();
});
