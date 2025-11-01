interface SingleProps {
  screenshotPath?: string;
}

export const Single = ({ screenshotPath }: SingleProps) => {
  return (
    <div>
      <div className="bg-muted rounded-lg p-4 h-full min-h-[400px] flex items-center justify-center overflow-hidden">
        {screenshotPath ? (
          <img
            src={screenshotPath || "/placeholder.svg"}
            alt="Differences"
            className="max-w-full h-full"
          />
        ) : (
          <div className="text-muted-foreground">No diff image available</div>
        )}
      </div>
    </div>
  );
};
