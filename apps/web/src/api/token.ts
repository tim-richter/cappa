/**
 * Where the access token lives between page loads.
 *
 * `sessionStorage`, not `localStorage`: the token grants capture control over
 * the machine running the server — it drives a real browser and writes to disk
 * — so it should not outlive the tab it was opened in. The cost is that a new
 * tab needs the full URL again.
 */
const STORAGE_KEY = "cappa.token";

/** Reading storage can throw outright — private mode, blocked site data. */
const readStored = (): string | undefined => {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
};

const writeStored = (token: string): void => {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Storage unavailable. The token still works for this page load; it just
    // will not survive a reload.
  }
};

/** Drop `token` from the address bar, keeping every other query parameter. */
const stripTokenFromUrl = (params: URLSearchParams): void => {
  params.delete("token");
  const query = params.toString();
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
  );
};

/**
 * The access token this UI should send on every API request, if there is one.
 *
 * When the server is bound off loopback it requires a token and prints it as
 * part of the URL it tells you to open. That URL is the only time the token is
 * ever visible, and it is gone from the address bar after the first
 * client-side navigation — so lifting it out per call site is not enough: it is
 * captured once, persisted for the tab, and read back on every later load.
 *
 * It is also removed from the address bar as soon as it has been captured, so
 * it stops leaking into bookmarks, screenshots and the referer header.
 */
export const resolveToken = (): string | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }

  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("token");

  if (fromUrl) {
    writeStored(fromUrl);
    stripTokenFromUrl(params);
    return fromUrl;
  }

  return readStored();
};
