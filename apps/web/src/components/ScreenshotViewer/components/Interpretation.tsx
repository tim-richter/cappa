import type { ChangeRegion, InterpretResult } from "@cappa/core";
import { Badge } from "@ui/components/badge";
import { cn } from "@ui/lib/utils";

/**
 * Visual styling per `changeType` reported by blazediff's interpret pass,
 * keyed by the kebab-case form current releases report. Earlier releases
 * reported PascalCase (`ColorChange`), so lookups normalise first. Falls back
 * to a neutral style for unknown/future change types.
 */
const CHANGE_TYPE_STYLES: Record<
  string,
  { label: string; box: string; dot: string }
> = {
  addition: {
    label: "Added",
    box: "border-emerald-500 bg-emerald-500/10",
    dot: "bg-emerald-500",
  },
  deletion: {
    label: "Removed",
    box: "border-red-500 bg-red-500/10",
    dot: "bg-red-500",
  },
  "color-change": {
    label: "Color",
    box: "border-blue-500 bg-blue-500/10",
    dot: "bg-blue-500",
  },
  "content-change": {
    label: "Content",
    box: "border-amber-500 bg-amber-500/10",
    dot: "bg-amber-500",
  },
  shift: {
    label: "Shifted",
    box: "border-violet-500 bg-violet-500/10",
    dot: "bg-violet-500",
  },
  "rendering-noise": {
    label: "Noise",
    box: "border-zinc-400 bg-zinc-400/10",
    dot: "bg-zinc-400",
  },
};

const DEFAULT_CHANGE_TYPE_STYLE = {
  label: "Changed",
  box: "border-zinc-400 bg-zinc-400/10",
  dot: "bg-zinc-400",
};

export const normalizeChangeType = (changeType: string): string =>
  changeType
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();

function changeTypeStyle(changeType: string) {
  return (
    CHANGE_TYPE_STYLES[normalizeChangeType(changeType)] ??
    DEFAULT_CHANGE_TYPE_STYLE
  );
}

// Keyed lowercase; current interpret releases report `high`, earlier ones `High`.
const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-emerald-800 text-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-300",
  medium: "bg-amber-700 text-amber-50 dark:bg-amber-900/50 dark:text-amber-300",
  high: "bg-red-800 text-red-50 dark:bg-red-900/50 dark:text-red-300",
};

export function SeverityBadge({
  severity,
  className,
}: {
  severity: string;
  className?: string;
}) {
  return (
    <Badge
      variant="default"
      className={cn(
        "uppercase text-xs cursor-default",
        SEVERITY_STYLES[severity.toLowerCase()] ??
          "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      {severity} severity
    </Badge>
  );
}

/**
 * Banner summarising the structured interpretation of a diff: severity, the
 * human-readable summary and the number of detected regions.
 */
export function InterpretationSummary({
  interpretation,
}: {
  interpretation: InterpretResult;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 mb-1">
        <SeverityBadge severity={interpretation.severity} />
        <span className="text-xs text-muted-foreground">
          {interpretation.totalRegions}{" "}
          {interpretation.totalRegions === 1 ? "region" : "regions"} ·{" "}
          {interpretation.diffPercentage.toFixed(2)}% changed
        </span>
      </div>
      <p className="text-sm text-card-foreground">{interpretation.summary}</p>
    </div>
  );
}

/**
 * Absolutely-positioned bounding boxes drawn over the diff image. Positions are
 * expressed as percentages of the interpreted image size so they stay aligned
 * regardless of how the image is scaled to fit its container.
 */
export function DiffRegionsOverlay({
  interpretation,
  activeRegion,
  onHoverRegion,
}: {
  interpretation: InterpretResult;
  activeRegion: number | null;
  onHoverRegion: (index: number | null) => void;
}) {
  const { width, height, regions } = interpretation;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return (
    <div className="absolute inset-0">
      {regions.map((region, index) => {
        const style = changeTypeStyle(region.changeType);
        const isActive = activeRegion === index;

        return (
          <button
            key={`${region.changeType}-${region.bbox.x}-${region.bbox.y}-${index}`}
            type="button"
            aria-label={`${region.changeType} region at ${region.position}`}
            onMouseEnter={() => onHoverRegion(index)}
            onMouseLeave={() => onHoverRegion(null)}
            onFocus={() => onHoverRegion(index)}
            onBlur={() => onHoverRegion(null)}
            className={cn(
              "absolute border-2 transition-opacity",
              style.box,
              isActive ? "opacity-100 ring-2 ring-offset-1" : "opacity-70",
            )}
            style={{
              left: `${(region.bbox.x / width) * 100}%`,
              top: `${(region.bbox.y / height) * 100}%`,
              width: `${(region.bbox.width / width) * 100}%`,
              height: `${(region.bbox.height / height) * 100}%`,
            }}
          />
        );
      })}
    </div>
  );
}

function RegionListItem({
  region,
  index,
  isActive,
  onHoverRegion,
}: {
  region: ChangeRegion;
  index: number;
  isActive: boolean;
  onHoverRegion: (index: number | null) => void;
}) {
  const style = changeTypeStyle(region.changeType);

  return (
    <button
      type="button"
      onMouseEnter={() => onHoverRegion(index)}
      onMouseLeave={() => onHoverRegion(null)}
      onFocus={() => onHoverRegion(index)}
      onBlur={() => onHoverRegion(null)}
      className={cn(
        "w-full text-left rounded-md border px-3 py-2 transition-colors",
        isActive ? "border-ring bg-accent" : "border-border hover:bg-accent/50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-card-foreground">
          <span className={cn("size-2 rounded-full", style.dot)} />
          {style.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {region.percentage.toFixed(2)}%
        </span>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground capitalize">
        {region.position}
      </div>
    </button>
  );
}

/**
 * Interactive list of detected regions. Hovering an item highlights the
 * matching overlay box (and vice versa via the shared `activeRegion` state).
 */
export function RegionList({
  interpretation,
  activeRegion,
  onHoverRegion,
}: {
  interpretation: InterpretResult;
  activeRegion: number | null;
  onHoverRegion: (index: number | null) => void;
}) {
  return (
    <div className="w-72 shrink-0 flex flex-col gap-2 overflow-y-auto">
      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        Regions ({interpretation.regions.length})
      </h4>
      {interpretation.regions.map((region, index) => (
        <RegionListItem
          key={`${region.changeType}-${region.bbox.x}-${region.bbox.y}-${index}`}
          region={region}
          index={index}
          isActive={activeRegion === index}
          onHoverRegion={onHoverRegion}
        />
      ))}
    </div>
  );
}
