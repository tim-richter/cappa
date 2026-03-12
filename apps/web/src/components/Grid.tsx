import type { Screenshot } from "@cappa/core";
import { Card } from "@ui/components/card";
import { Checkbox } from "@ui/components/checkbox";
import { cn } from "@ui/lib/utils";
import type { FC } from "react";
import { Link } from "react-router";
import { findPreviewScreenshot } from "@/util/screenshot";
import { CategoryBadge } from "./CategoryBadge";

export interface ScreenshotGridSelectionProps {
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}

interface ScreenshotGridProps {
  screenshots: Screenshot[];
  category: "changed" | "new" | "deleted" | "passed";
  selection?: ScreenshotGridSelectionProps;
  showCheckboxes?: boolean;
}

export const Grid: FC<ScreenshotGridProps> = ({
  screenshots,
  category,
  selection,
  showCheckboxes = false,
}) => {
  const canSelect = showCheckboxes && selection;

  const handleToggle = (id: string) => {
    if (!selection) return;
    const next = new Set(selection.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onSelectionChange(next);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {screenshots.map((screenshot) => (
          <Card
            key={screenshot.id}
            className={cn(
              "p-0 group cursor-pointer transition-all duration-200 hover:shadow-lg relative",
            )}
          >
            {canSelect && (
              <div className="absolute top-2 left-2 z-10">
                <Checkbox
                  checked={selection?.selectedIds.has(screenshot.id) ?? false}
                  onCheckedChange={() => handleToggle(screenshot.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${screenshot.name}`}
                />
              </div>
            )}
            <Link
              to={`/screenshots/${screenshot.id}`}
              onClick={
                canSelect
                  ? (e) => {
                      e.preventDefault();
                      handleToggle(screenshot.id);
                    }
                  : undefined
              }
            >
              <div className="relative aspect-4/3 overflow-hidden rounded-t-lg">
                <img
                  src={findPreviewScreenshot(screenshot) || "/placeholder.svg"}
                  alt={screenshot.name}
                  loading="lazy"
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
  );
};
