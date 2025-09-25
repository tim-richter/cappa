import { ImagePanZoom } from "./PanZoom";

interface SingleProps {
  screenshotPath?: string;
}

export const Single = ({ screenshotPath }: SingleProps) => {
  return (
    <div className="grid h-full">
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Single
        </h3>

        <div className="bg-muted rounded-lg p-4 h-full min-h-[400px] flex items-center justify-center overflow-hidden">
          {screenshotPath ? (
            <ImagePanZoom
              src={screenshotPath || "/placeholder.svg"}
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
