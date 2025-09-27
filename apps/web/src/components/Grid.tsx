import type { Screenshot } from "@cappa/core";
import { Badge } from "@ui/components/badge";
import { Card } from "@ui/components/card";
import { cn } from "@ui/lib/utils";
import type { FC } from "react";
import { Link } from "react-router";
import { findPreviewScreenshot } from "@/util/screenshot";
import { CategoryBadge } from "./CategoryBadge";

interface ScreenshotGridProps {
  screenshots: Screenshot[];
  category: "changed" | "new" | "deleted" | "passed";
}

export const Grid: FC<ScreenshotGridProps> = ({ screenshots, category }) => {
  return (
    <div className="flex-1 overflow-auto">
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {screenshots.map((screenshot) => (
            <Card
              key={screenshot.id}
              className={cn(
                "p-0 group cursor-pointer transition-all duration-200 hover:shadow-lg",
              )}
            >
              <Link to={`/screenshots/${screenshot.id}`}>
                <div className="relative aspect-[4/3] overflow-hidden rounded-t-lg">
                  <img
                    src={
                      findPreviewScreenshot(screenshot) || "/placeholder.svg"
                    }
                    alt={screenshot.name}
                    className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />

                  <CategoryBadge
                    category={category}
                    className="absolute top-2 right-2"
                  />
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium text-card-foreground truncate flex-1 mr-2">
                      {screenshot.name}
                    </h3>
                  </div>
                </div>
              </Link>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
