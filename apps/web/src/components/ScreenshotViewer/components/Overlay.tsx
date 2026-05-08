import type { ChangedScreenshot } from "@cappa/core";
import { Slider } from "@ui/components/slider";
import { useUncontrolled } from "@ui/hooks/use-uncontrolled";

interface OverlayProps {
  screenshot: ChangedScreenshot;
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
    <div className="relative">
      <div className="flex items-center gap-4 fixed bottom-6 left-1/2 -translate-x-1/2 shadow-xl py-2 px-8 rounded-lg bg-background backdrop-blur-lg z-10000">
        <div className="flex items-center justify-center gap-2">
          <span className="text-lg">Before</span>
          <Slider
            min={0}
            max={100}
            value={[overlayOpacity]}
            onValueChange={(value) => setOverlayOpacity(value[0])}
            className="w-64 h-2"
          />
          <span className="text-lg">After</span>
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
                ? "No after image available"
                : "No before image available"}
          </div>
        )}
      </div>
    </div>
  );
}
