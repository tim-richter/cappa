import type { Screenshot } from "@cappa/core";

interface DiffProps {
  screenshot: Screenshot;
}

export const Diff = ({ screenshot }: DiffProps) => {
  return (
    <div className="">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Visual Differences
      </h3>

      <div className="bg-muted rounded-lg p-4 h-full min-h-[400px] flex items-center justify-center overflow-hidden">
        {screenshot.diffPath ? (
          <img
            src={screenshot.diffPath}
            alt="Differences"
            className="max-w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="text-muted-foreground">No diff image available</div>
        )}
      </div>
    </div>
  );
};
