import type { ChangedScreenshot } from "@cappa/protocol";
import { getPixelRatios } from "../pixelRatio";
import { InspectableImage } from "./Inspect";

interface SideBySideProps {
  screenshot: ChangedScreenshot;
}

export function SideBySide({ screenshot }: SideBySideProps) {
  const ratios = getPixelRatios(screenshot);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      <Side
        title="Before"
        path={screenshot.expectedPath}
        pixelRatio={ratios.expected}
      />

      <Side
        title="After"
        path={screenshot.actualPath}
        pixelRatio={ratios.actual}
      />
    </div>
  );
}

const Side = ({
  title,
  path,
  pixelRatio,
}: {
  title: string;
  path?: string;
  pixelRatio: number;
}) => {
  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
        {title}
      </h3>

      <div className="bg-muted rounded-lg p-4 h-full min-h-[400px] flex items-center justify-center overflow-hidden">
        {path ? (
          <InspectableImage
            src={path}
            alt={title}
            pixelRatio={pixelRatio}
            className="block max-w-full max-h-full object-contain"
          />
        ) : (
          <div className="text-muted-foreground">No image available</div>
        )}
      </div>
    </div>
  );
};
