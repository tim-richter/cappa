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
          <input
            type="range"
            min="0"
            max="100"
            value={overlayOpacity}
            onChange={(e) => setOverlayOpacity(Number(e.target.value))}
            className="w-32"
          />
          <span className="text-sm text-muted-foreground w-8">
            {overlayOpacity}%
          </span>
        </div>
      </div>
      <div
        className="bg-muted rounded-lg p-4 min-h-[500px] flex items-center justify-center relative overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {screenshot.actualPath && (
          <img
            src={screenshot.actualPath || "/placeholder.svg"}
            alt="Before"
            className="max-w-none rounded border border-border absolute transition-transform"
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
            }}
            draggable={false}
          />
        )}
        {screenshot.expectedPath && (
          <img
            src={screenshot.expectedPath || "/placeholder.svg"}
            alt="After"
            className="max-w-none rounded border border-border transition-transform"
            style={{
              opacity: overlayOpacity / 100,
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
            }}
            draggable={false}
          />
        )}
      </div>
    </div>
  );
}
