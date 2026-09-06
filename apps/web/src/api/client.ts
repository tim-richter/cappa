import { createClient } from "@cappa/client";

/**
 * When the server is bound off loopback it requires a token, and prints it as
 * part of the URL it tells you to open. Lift it out of the query string so the
 * client can send it as a header on every request.
 */
const tokenFromUrl = (): string | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }
  return new URLSearchParams(window.location.search).get("token") ?? undefined;
};

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
  token: tokenFromUrl(),
});
