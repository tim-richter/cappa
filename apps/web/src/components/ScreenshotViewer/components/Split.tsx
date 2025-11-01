import type { Screenshot } from "@cappa/core";
import { useCallback, useEffect, useRef, useState } from "react";

interface SplitProps {
  screenshot: Screenshot;
}

export const Split = ({ screenshot }: SplitProps) => {
  const [splitPosition, setSplitPosition] = useState(50); // Percentage from left
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSplitPosition(percentage);
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add global mouse event listeners when dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    } else {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div className="grid h-full">
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Split View
        </h3>
        <div className="bg-muted rounded-lg p-4 min-h-[400px] flex items-center justify-center overflow-auto">
          {screenshot.expectedPath && screenshot.actualPath ? (
            <div
              ref={containerRef}
              className="relative inline-block max-w-full max-h-full rounded border border-border"
            >
              {/* Before image (left side) */}
              <div className="relative">
                <img
                  src={screenshot.expectedPath}
                  alt="Before"
                  className="block max-w-full h-full"
                  draggable={false}
                />
              </div>

              {/* After image (right side) */}
              <div
                className="absolute top-0 left-0 overflow-hidden"
                style={{ clipPath: `inset(0 ${100 - splitPosition}% 0 0)` }}
              >
                <img
                  src={screenshot.actualPath}
                  alt="After"
                  className="block max-w-full h-full"
                  draggable={false}
                />
              </div>

              {/* Divider line */}
              <button
                className="absolute top-0 bottom-0 w-8 cursor-col-resize z-10 border-0 p-0 -translate-x-1/2"
                style={{ left: `${splitPosition}%` }}
                onMouseDown={handleMouseDown}
                aria-label="Drag to adjust split position"
                type="button"
              >
                {/* Visual line */}
                <div className="absolute top-0 bottom-0 left-1/2 w-1 bg-primary -translate-x-1/2"></div>
                {/* Drag handle */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full border-2 border-white shadow-lg"></div>
              </button>
            </div>
          ) : (
            <div className="text-muted-foreground">
              {!screenshot.expectedPath && !screenshot.actualPath
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
};
