import type { Screenshot } from "@/types";
import { ImagePanZoom } from "./PanZoom";

interface DiffProps {
  screenshot: Screenshot;
}

export const Diff = ({ screenshot }: DiffProps) => {
  return (
    <div className="grid h-full">
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Visual Differences
        </h3>

        <div className="bg-muted rounded-lg p-4 h-full min-h-[400px] flex items-center justify-center overflow-hidden">
          {screenshot.diffPath ? (
            <ImagePanZoom
              src={screenshot.diffPath || "/placeholder.svg"}
              alt="Differences"
              className="max-w-none rounded border border-border transition-transform"
            />
          ) : (
            <div className="text-muted-foreground">No diff image available</div>
          )}
        </div>
      </div>
    </div>
  );
};
