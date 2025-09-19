import type { FC } from "react"
import { Card } from "@ui/components/card"
import { cn } from "@ui/lib/utils"
import { Button } from "@ui/components/button"
import { Badge } from "@ui/components/badge"
import { Clock, Download, Eye, MoreHorizontal } from "lucide-react"

export interface Screenshot {
  id: string
  name: string
  url: string
  category: "changed" | "new" | "deleted" | "passed"
  timestamp: Date
  size?: string
}

interface ScreenshotGridProps {
  screenshots: Screenshot[]
  selectedScreenshot: Screenshot | null
  onScreenshotSelect: (screenshot: Screenshot | null) => void
}

const categoryColors = {
  changed: "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400",
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
  deleted: "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400",
  passed: "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
}

const formatTimestamp = (date: Date) => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export const Grid: FC<ScreenshotGridProps> = ({ screenshots, selectedScreenshot, onScreenshotSelect }) => {
  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {screenshots.map((screenshot) => (
            <Card
              key={screenshot.id}
              className={cn(
                "p-0 group cursor-pointer transition-all duration-200 hover:shadow-lg",
                selectedScreenshot?.id === screenshot.id && "ring-2 ring-primary",
              )}
              onClick={() => onScreenshotSelect(screenshot)}
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-t-lg">
                <img
                  src={screenshot.url || "/placeholder.svg"}
                  alt={screenshot.name}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                />

                {/* Overlay with actions */}
                <div
                  className={cn(
                    "absolute inset-0 bg-black/60 flex items-center justify-center gap-2 transition-opacity duration-200",
                  )}
                >
                  <Button size="sm" variant="secondary">
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  <Button size="sm" variant="secondary">
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </div>

                {/* Category badge */}
                <Badge className={cn("absolute top-2 right-2 text-xs", categoryColors[screenshot.category])}>
                  {screenshot.category}
                </Badge>
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-card-foreground truncate flex-1 mr-2">{screenshot.name}</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center text-xs text-muted-foreground">
                  <Clock className="h-3 w-3 mr-1" />
                  {formatTimestamp(screenshot.timestamp)}
                </div>

                {screenshot.size && <div className="text-xs text-muted-foreground mt-1">{screenshot.size}</div>}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}