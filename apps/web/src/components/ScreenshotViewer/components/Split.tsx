import type { Screenshot } from "@/types";

interface SplitProps {
  screenshot: Screenshot;
}

export const Split = ({ screenshot }: SplitProps) => {
  return (
    <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Split View
            </h3>
            <div className="bg-muted rounded-lg p-4 min-h-[500px] flex items-center justify-center relative overflow-hidden">
              <div className="relative w-full h-full flex">
                <div className="w-1/2 overflow-hidden">
                  {screenshot.actualPath && (
                    <img
                      src={screenshot.actualPath || "/placeholder.svg"}
                      alt="Before"
                      className="w-full h-full object-cover rounded-l border border-border"
                    />
                  )}
                </div>
                <div className="w-1/2 overflow-hidden">
                  {screenshot.expectedPath && (
                    <img
                      src={screenshot.expectedPath || "/placeholder.svg"}
                      alt="After"
                      className="w-full h-full object-cover rounded-r border border-border"
                    />
                  )}
                </div>
                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-primary transform -translate-x-0.5"></div>
              </div>
            </div>
          </div>
  )
}