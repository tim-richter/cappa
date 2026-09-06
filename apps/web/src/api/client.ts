import { createClient } from "@cappa/client";
import { resolveToken } from "./token";

/**
 * The capture engine this UI drives.
 *
 * Same-origin, so relative URLs are correct: the review UI is served by the
 * server it talks to.
 *
 * Everything the capture surface does goes through here rather than raw
 * `fetch`. That is what keeps the boundary honest — the UI holds a
 * `CaptureEngine`, so pointing it at a remote capture server later is a
 * `baseUrl` change and nothing else.
 */
export const client = createClient({
  baseUrl: "",
  token: resolveToken(),
});
