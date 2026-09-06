import type { TaskStatus } from "@cappa/protocol";
import { Badge } from "@ui/components/badge";
import { cn } from "@ui/lib/utils";

/**
 * Colours match `CategoryBadge` where the meanings line up (`new`, `changed`,
 * `passed`), so a task row and a screenshot row read the same way.
 */
const statusColors: Record<TaskStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-sky-200 text-sky-900 dark:bg-sky-900/30 dark:text-sky-300",
  passed:
    "bg-green-200 text-green-800 dark:bg-green-900/20 dark:text-green-400",
  changed:
    "bg-orange-200 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400",
  new: "bg-blue-200 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
  failed: "bg-red-200 text-red-800 dark:bg-red-900/20 dark:text-red-400",
  skipped: "bg-muted text-muted-foreground",
};

export const TaskStatusBadge = ({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) => (
  <Badge className={cn("text-xs", statusColors[status], className)}>
    {status}
  </Badge>
);
