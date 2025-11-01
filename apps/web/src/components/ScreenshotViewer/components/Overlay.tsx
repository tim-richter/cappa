import type { Screenshot } from "@cappa/core";
import { Slider } from "@ui/components/slider";
import { useUncontrolled } from "@ui/hooks/use-uncontrolled";

interface OverlayProps {
  screenshot: Screenshot;
  opacity?: number;
  onOpacityChange?: (opacity: number) => void;
  defaultOpacity?: number;
}

export function Overlay({
  screenshot,
  opacity,
  onOpacityChange,
  defaultOpacity = 50,
}: OverlayProps) {
  const [overlayOpacity, setOverlayOpacity] = useUncontrolled({
    value: opacity,
    defaultValue: defaultOpacity,
    onChange: onOpacityChange,
  });

  return (
    <div>
      <div className="flex items-center gap-4 mb-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Overlay Comparison
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Opacity:</span>
          <Slider
            min={0}
            max={100}
            value={[overlayOpacity]}
            onValueChange={(value) => setOverlayOpacity(value[0])}
            className="w-64"
          />
          <span className="text-sm text-muted-foreground w-8">
            {overlayOpacity}%
          </span>
        </div>
      </div>

      <div className="bg-muted rounded-lg p-4 h-full min-h-[400px] flex items-center justify-center overflow-hidden">
        {screenshot.actualPath && screenshot.expectedPath ? (
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Base image */}
            <img
              src={screenshot.expectedPath || "/placeholder.svg"}
              alt="Before"
              className="h-full w-auto"
              draggable={false}
            />
            {/* Overlay image */}
            <img
              src={screenshot.actualPath || "/placeholder.svg"}
              alt="After"
              className="h-full w-auto absolute"
              style={{ opacity: overlayOpacity / 100 }}
              draggable={false}
            />
          </div>
        ) : (
          <div className="text-muted-foreground">
            {!screenshot.actualPath && !screenshot.expectedPath
              ? "No images available"
              : !screenshot.actualPath
                ? "No before image available"
                : "No after image available"}
          </div>
        )}
      </div>
    </div>
  );
}
