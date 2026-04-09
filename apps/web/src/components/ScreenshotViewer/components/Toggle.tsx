import type { ChangedScreenshot } from "@cappa/core";
import { Switch } from "@ui/components/switch";
import { useUncontrolled } from "@ui/hooks/use-uncontrolled";
import { cn } from "@ui/lib/utils";

export type ToggleSide = "before" | "after";

interface ToggleProps {
  screenshot: ChangedScreenshot;
  side?: ToggleSide;
  onSideChange?: (side: ToggleSide) => void;
  defaultSide?: ToggleSide;
}

export function Toggle({
  screenshot,
  side,
  onSideChange,
  defaultSide = "before",
}: ToggleProps) {
  const [activeSide, setActiveSide] = useUncontrolled({
    value: side,
    defaultValue: defaultSide,
    onChange: onSideChange,
  });

  const hasBoth = Boolean(screenshot.expectedPath && screenshot.actualPath);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Toggle View
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-lg text-muted-foreground">Before</span>
          <Switch
            checked={activeSide === "after"}
            onCheckedChange={(checked) =>
              setActiveSide(checked ? "after" : "before")
            }
            disabled={!hasBoth}
            aria-label="Show after instead of before"
          />
          <span className="text-lg text-muted-foreground">After</span>
        </div>
      </div>

      <div className="bg-muted rounded-lg p-4 h-full min-h-[400px] flex items-center justify-center overflow-hidden">
        {hasBoth && screenshot.expectedPath && screenshot.actualPath ? (
          <div className="relative flex min-h-[400px] w-full flex-1 items-center justify-center">
            <img
              src={screenshot.expectedPath}
              alt="Before"
              draggable={false}
              aria-hidden={activeSide !== "before"}
              className={cn(
                "pointer-events-none max-h-full w-auto max-w-full select-none",
                activeSide === "before"
                  ? "z-10 opacity-100"
                  : "z-0 opacity-0 invisible",
              )}
            />
            <img
              src={screenshot.actualPath}
              alt="After"
              draggable={false}
              aria-hidden={activeSide !== "after"}
              className={cn(
                "pointer-events-none absolute max-h-full w-auto max-w-full select-none",
                activeSide === "after"
                  ? "z-10 opacity-100"
                  : "z-0 opacity-0 invisible",
              )}
            />
          </div>
        ) : (
          <div className="text-muted-foreground">
            {!screenshot.actualPath && !screenshot.expectedPath
              ? "No images available"
              : !screenshot.actualPath
                ? "No after image available"
                : "No before image available"}
          </div>
        )}
      </div>
    </div>
  );
}
