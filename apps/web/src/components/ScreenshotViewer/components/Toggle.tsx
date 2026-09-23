import type { ChangedScreenshot } from "@cappa/protocol";
import { Switch } from "@ui/components/switch";
import { useUncontrolled } from "@ui/hooks/use-uncontrolled";
import { cn } from "@ui/lib/utils";
import { InspectableImage } from "./Inspect";

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
    <div className="relative">
      <div className="flex items-center gap-4 fixed bottom-6 left-1/2 -translate-x-1/2 shadow-xl py-2 px-8 rounded-lg bg-background backdrop-blur-lg z-10000">
        <div className="flex items-center justify-center gap-2">
          <span className="text-lg">Before</span>
          <Switch
            checked={activeSide === "after"}
            onCheckedChange={(checked) =>
              setActiveSide(checked ? "after" : "before")
            }
            disabled={!hasBoth}
            aria-label="Show after instead of before"
          />
          <span className="text-lg">After</span>
        </div>
      </div>

      <div className="bg-muted rounded-lg p-4 h-full min-h-[400px] flex items-center justify-center overflow-hidden">
        {hasBoth && screenshot.expectedPath && screenshot.actualPath ? (
          <InspectableImage
            src={screenshot.expectedPath}
            alt="Before"
            ariaHidden={activeSide !== "before"}
            className={cn(
              "pointer-events-none block max-h-full w-auto max-w-full select-none",
              activeSide === "before"
                ? "z-10 opacity-100"
                : "z-0 opacity-0 invisible",
            )}
          >
            <img
              src={screenshot.actualPath}
              alt="After"
              draggable={false}
              aria-hidden={activeSide !== "after"}
              className={cn(
                "pointer-events-none absolute top-0 left-0 h-full w-full select-none",
                activeSide === "after"
                  ? "z-10 opacity-100"
                  : "z-0 opacity-0 invisible",
              )}
            />
          </InspectableImage>
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
