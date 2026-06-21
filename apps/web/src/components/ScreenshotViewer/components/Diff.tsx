import type { ChangedScreenshot } from "@cappa/core";
import { useState } from "react";
import {
  DiffRegionsOverlay,
  InterpretationSummary,
  RegionList,
} from "./Interpretation";

interface DiffProps {
  screenshot: ChangedScreenshot;
}

export const Diff = ({ screenshot }: DiffProps) => {
  const interpretation = screenshot.diffMeta?.interpretation;
  const hasRegions = !!interpretation && interpretation.regions.length > 0;
  const [activeRegion, setActiveRegion] = useState<number | null>(null);

  return (
    <div className="flex flex-col h-full gap-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        Visual Differences
      </h3>

      {interpretation && (
        <InterpretationSummary interpretation={interpretation} />
      )}

      <div className="flex-1 flex gap-4 min-h-0">
        <div className="flex-1 bg-muted rounded-lg p-4 min-h-[400px] flex items-center justify-center overflow-hidden">
          {screenshot.diffPath ? (
            <div className="relative inline-block max-w-full max-h-full">
              <img
                src={screenshot.diffPath}
                alt="Differences"
                className="block max-w-full max-h-full object-contain"
                draggable={false}
              />
              {interpretation && (
                <DiffRegionsOverlay
                  interpretation={interpretation}
                  activeRegion={activeRegion}
                  onHoverRegion={setActiveRegion}
                />
              )}
            </div>
          ) : (
            <div className="text-muted-foreground">No diff image available</div>
          )}
        </div>

        {hasRegions && (
          <RegionList
            interpretation={interpretation}
            activeRegion={activeRegion}
            onHoverRegion={setActiveRegion}
          />
        )}
      </div>
    </div>
  );
};
