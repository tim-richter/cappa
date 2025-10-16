import type { StorybookRenderOptions } from "../types";

type SBUrlOptions = StorybookRenderOptions & {
  baseUrl: string;
  storyId: string;
};

function encodePairs(obj: Record<string, unknown> | undefined) {
  if (!obj || !Object.keys(obj).length) return "";
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => {
      const val =
        typeof v === "string"
          ? encodeURIComponent(v)
          : typeof v === "number" || typeof v === "boolean"
            ? String(v)
            : encodeURIComponent(JSON.stringify(v));
      return `${encodeURIComponent(k)}:${val}`;
    })
    .join(";");
}

export function buildStorybookIframeUrl({
  baseUrl,
  storyId,
  viewMode = "story",
  args,
  globals,
  query,
  fullscreen = true,
  singleStory = true,
}: SBUrlOptions) {
  const u = new URL("/iframe.html", baseUrl);
  u.searchParams.set("id", storyId);
  u.searchParams.set("viewMode", viewMode);

  const argPairs = encodePairs(args);
  if (argPairs) u.searchParams.set("args", argPairs);

  const globalPairs = encodePairs(globals);
  if (globalPairs) u.searchParams.set("globals", globalPairs);

  if (fullscreen) u.searchParams.set("full", "1");
  if (singleStory) u.searchParams.set("singleStory", "true");

  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      u.searchParams.set(k, String(v));
    }
  }

  return u.toString();
}
