import type { Screenshot } from "@/types";
import { ImagePanZoom } from "./PanZoom";

interface SideBySideProps {
  screenshot: Screenshot;
}

export function SideBySide({ screenshot }: SideBySideProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Before
        </h3>

        <div className="bg-muted rounded-lg p-4 h-full min-h-[400px] flex items-center justify-center overflow-hidden">
          {screenshot.actualPath ? (
            <ImagePanZoom
              src={screenshot.actualPath || "/placeholder.svg"}
              alt="Before"
              className="max-w-none rounded border border-border transition-transform"
            />
          ) : (
            <div className="text-muted-foreground">
              No before image available
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          After
        </h3>

        <div className="bg-muted rounded-lg p-4 h-full min-h-[400px] flex items-center justify-center">
          {screenshot.expectedPath ? (
            <ImagePanZoom
              src={screenshot.expectedPath || "/placeholder.svg"}
              alt="After"
              className="max-w-none rounded border border-border transition-transform"
            />
          ) : (
            <div className="text-muted-foreground">
              No after image available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
