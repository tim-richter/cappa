/**
 * Inspect regions: rectangles the user types in by hand, drawn over whatever
 * screenshot they are looking at.
 *
 * A diff report says *where* something changed — a CI log, an interpreted
 * region list, a bug report all quote a box as a size and a position — but
 * those numbers are only useful if you can see them on the image. This is the
 * smallest thing that closes that loop: four number fields, one coloured box.
 *
 * Deliberately unconnected to `diffMeta.interpretation`: the interpretation is
 * drawn by `DiffRegionsOverlay` and only exists when a local run produced it,
 * whereas these coordinates come from somewhere else entirely and must work on
 * a screenshot cappa has never diffed.
 */

export const INSPECT_REGIONS_STORAGE_KEY = "cappa.review.inspectRegions";
export const INSPECT_OPEN_STORAGE_KEY = "cappa.review.inspectOpen";

export type InspectRegion = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** The natural (pixel) size of the image a region is drawn over. */
export type ImageSize = { width: number; height: number };

export type InspectRegionField = "x" | "y" | "width" | "height";

/**
 * Colours cycled per region, so two boxes on the same image stay
 * distinguishable without asking the user to pick anything.
 *
 * Kept clear of the `changeType` colours in `Interpretation.tsx`: a manual
 * region and an interpreted one can be on screen at the same time in diff view,
 * and they must not be mistakable for each other.
 */
export const INSPECT_REGION_COLORS = [
  { box: "border-cyan-400 bg-cyan-400/10", label: "bg-cyan-400 text-cyan-950" },
  {
    box: "border-fuchsia-400 bg-fuchsia-400/10",
    label: "bg-fuchsia-400 text-fuchsia-950",
  },
  {
    box: "border-lime-400 bg-lime-400/10",
    label: "bg-lime-400 text-lime-950",
  },
  {
    box: "border-orange-400 bg-orange-400/10",
    label: "bg-orange-400 text-orange-950",
  },
] as const;

export const regionColor = (index: number) =>
  INSPECT_REGION_COLORS[index % INSPECT_REGION_COLORS.length];

const DEFAULT_REGION = { x: 0, y: 0, width: 100, height: 100 };

let fallbackId = 0;

const createId = () => {
  // `randomUUID` is unavailable on a page served over plain http from a
  // non-loopback host, which `cappa serve` allows.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  fallbackId += 1;
  return `region-${fallbackId}`;
};

export const createInspectRegion = (
  region: Partial<Omit<InspectRegion, "id">> = {},
): InspectRegion => ({ id: createId(), ...DEFAULT_REGION, ...region });

/**
 * Read a typed coordinate.
 *
 * Anything that is not a number is `null` rather than `0`: a half-typed or
 * cleared field must leave the region where it was instead of snapping the box
 * to the top-left corner mid-keystroke.
 */
export const parseCoordinate = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};

/**
 * Position a region as percentages of the image's own pixel size, so the box
 * stays on the same content however the image is scaled to fit its container.
 */
export const regionStyle = (region: InspectRegion, size: ImageSize) => ({
  left: `${(region.x / size.width) * 100}%`,
  top: `${(region.y / size.height) * 100}%`,
  width: `${(region.width / size.width) * 100}%`,
  height: `${(region.height / size.height) * 100}%`,
});

/**
 * Whether a region reaches outside the image.
 *
 * Worth flagging rather than silently drawing off-image: coordinates that
 * overflow are the signature of a report taken at a different viewport or
 * device pixel ratio than the screenshot on screen, which is exactly the
 * mistake this UI is here to expose.
 */
export const isRegionOutside = (region: InspectRegion, size: ImageSize) =>
  region.x < 0 ||
  region.y < 0 ||
  region.x + region.width > size.width ||
  region.y + region.height > size.height;

const isRegion = (value: unknown): value is InspectRegion => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    ["x", "y", "width", "height"].every(
      (key) => typeof candidate[key] === "number",
    )
  );
};

export const readPersistedRegions = (): InspectRegion[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const persisted = window.localStorage.getItem(INSPECT_REGIONS_STORAGE_KEY);
    if (!persisted) {
      return [];
    }

    const parsed: unknown = JSON.parse(persisted);
    return Array.isArray(parsed) ? parsed.filter(isRegion) : [];
  } catch {
    return [];
  }
};

export const persistRegions = (regions: InspectRegion[]) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      INSPECT_REGIONS_STORAGE_KEY,
      JSON.stringify(regions),
    );
  } catch {
    // Ignore storage access failures and keep in-memory behavior.
  }
};

/**
 * Whether the panel was left open.
 *
 * Persisted with the regions it edits: walking to the next screenshot to look
 * for the same box should not mean re-opening the panel every time.
 */
export const readPersistedInspectOpen = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(INSPECT_OPEN_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

export const persistInspectOpen = (open: boolean) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(INSPECT_OPEN_STORAGE_KEY, String(open));
  } catch {
    // Ignore storage access failures and keep in-memory behavior.
  }
};
