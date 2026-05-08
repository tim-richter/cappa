export const VIEW_MODE_STORAGE_KEY = "cappa.review.viewMode";

export const VIEW_MODE_IDS = [
  "side-by-side",
  "toggle-view",
  "overlay",
  "split",
  "diff-only",
] as const;

export type ViewMode = (typeof VIEW_MODE_IDS)[number];

export const DEFAULT_VIEW_MODE: ViewMode = "side-by-side";

export function isViewMode(value: string): value is ViewMode {
  return VIEW_MODE_IDS.includes(value as ViewMode);
}

export function getInitialViewMode(): ViewMode {
  if (typeof window === "undefined") {
    return DEFAULT_VIEW_MODE;
  }

  try {
    const persisted = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (!persisted) {
      return DEFAULT_VIEW_MODE;
    }

    return isViewMode(persisted) ? persisted : DEFAULT_VIEW_MODE;
  } catch {
    return DEFAULT_VIEW_MODE;
  }
}

export function persistViewMode(viewMode: ViewMode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  } catch {
    // Ignore storage access failures and keep in-memory behavior.
  }
}
