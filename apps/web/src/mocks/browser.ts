import { delay, http } from "msw";
import { setupWorker } from "msw/browser";
import { handlers } from "./screenshots";

export const worker = setupWorker(
  http.all("*", async () => {
    await delay(250);
  }),
  ...handlers,
);
