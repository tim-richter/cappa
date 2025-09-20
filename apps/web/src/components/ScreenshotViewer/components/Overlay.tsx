import { Slider } from "@ui/components/slider";
import type { Screenshot } from "@/types";

interface OverlayProps {
  screenshot: Screenshot;
  overlayOpacity: number;
  setOverlayOpacity: (opacity: number) => void;
}

export function Overlay({
  screenshot,
  overlayOpacity,
  setOverlayOpacity,
}: OverlayProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Overlay Comparison
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Opacity:</span>
          <Slider
            min={0}
            max={100}
            value={[overlayOpacity]}
            onValueChange={(e) => setOverlayOpacity(e[0])}
            className="w-32"
          />
          <span className="text-sm text-muted-foreground w-8">
            {overlayOpacity}%
          </span>
        </div>
      </div>
      <div className="bg-muted rounded-lg p-4 min-h-[500px] flex items-center justify-center relative">
        {screenshot.actualPath && (
          <img
            src={screenshot.actualPath || "/placeholder.svg"}
            alt="Before"
            className="max-w-full max-h-full object-contain rounded border border-border absolute"
          />
        )}
        {screenshot.expectedPath && (
          <img
            src={screenshot.expectedPath || "/placeholder.svg"}
            alt="After"
            className="max-w-full max-h-full object-contain rounded border border-border absolute"
            style={{ opacity: Math.max(0.01, overlayOpacity / 100) }}
          />
        )}
      </div>
    </div>
  );
}
