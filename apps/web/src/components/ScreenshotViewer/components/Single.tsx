import { InspectableImage } from "./Inspect";

interface SingleProps {
  screenshotPath?: string;
}

export const Single = ({ screenshotPath }: SingleProps) => {
  return (
    <div>
      <div className="bg-muted rounded-lg p-4 h-full min-h-[400px] flex items-center justify-center overflow-hidden">
        {screenshotPath ? (
          <InspectableImage
            src={screenshotPath}
            alt="Screenshot"
            className="block max-w-full max-h-full object-contain"
          />
        ) : (
          <div className="text-muted-foreground">No diff image available</div>
        )}
      </div>
    </div>
  );
};
