import type { Screenshot } from "@/types";

interface DiffProps {
  screenshot: Screenshot;
}

export const Diff = ({ screenshot }: DiffProps) => {
  return (
    <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Visual Differences
            </h3>
            <div className="bg-muted rounded-lg p-4 min-h-[500px] flex items-center justify-center">
              {screenshot.diffPath ? (
                <img
                  src={screenshot.diffPath || "/placeholder.svg"}
                  alt="Differences"
                  className="max-w-full max-h-full object-contain rounded border border-border"
                />
              ) : (
                <div className="text-muted-foreground">
                  No diff image available
                </div>
              )}
            </div>
          </div>
  )
}