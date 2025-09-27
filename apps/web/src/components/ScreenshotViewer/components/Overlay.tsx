import type { Screenshot } from "@cappa/core";
import { useState } from "react";
import { PanZoom } from "./PanZoom";

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
  const [contentSize, setContentSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  return (
    <div className="grid h-full">
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
        <div className="bg-muted rounded-lg p-4 h-full min-h-[400px] flex items-center justify-center overflow-hidden">
          {screenshot.actualPath && screenshot.expectedPath ? (
            <PanZoom contentSize={contentSize} className="w-full h-full">
              <div className="relative w-full h-full">
                {/* Base image */}
                <img
                  src={screenshot.expectedPath || "/placeholder.svg"}
                  alt="Before"
                  className="max-w-none rounded border border-border absolute inset-0"
                  draggable={false}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setContentSize({
                      width: img.naturalWidth,
                      height: img.naturalHeight,
                    });
                  }}
                />
                {/* Overlay image */}
                <img
                  src={screenshot.actualPath || "/placeholder.svg"}
                  alt="After"
                  className="max-w-none rounded border border-border absolute inset-0"
                  style={{ opacity: overlayOpacity / 100 }}
                  draggable={false}
                />
              </div>
            </PanZoom>
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
    </div>
  );
}
