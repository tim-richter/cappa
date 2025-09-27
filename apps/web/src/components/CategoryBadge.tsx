import type { Screenshot } from "@cappa/core";
import { Badge } from "@ui/components/badge";
import { cn } from "@ui/lib/utils";

const categoryColors = {
  changed:
    "bg-orange-200 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400",
  new: "bg-blue-200 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
  deleted: "bg-red-200 text-red-800 dark:bg-red-900/20 dark:text-red-400",
  passed:
    "bg-green-200 text-green-800 dark:bg-green-900/20 dark:text-green-400",
};

export const CategoryBadge = ({
  category,
  className,
}: {
  category: Screenshot["category"];
  className?: string;
}) => {
  return (
    <Badge className={cn("text-xs", categoryColors[category], className)}>
      {category}
    </Badge>
  );
};
