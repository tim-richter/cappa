import type { RunState } from "@cappa/protocol";
import { cn } from "@ui/lib/utils";

const barColors: Partial<Record<RunState, string>> = {
  failed: "bg-red-500",
  cancelled: "bg-muted-foreground",
  completed: "bg-green-500",
};

export const RunProgress = ({
  value,
  state,
  completed,
  total,
}: {
  value: number;
  state: RunState;
  completed: number;
  total: number;
}) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {total > 0 ? `${completed} of ${total} captured` : "Discovering…"}
      </span>
      <span>{value}%</span>
    </div>

    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Capture progress"
    >
      <div
        className={cn(
          "h-full transition-all duration-300",
          barColors[state] ?? "bg-primary",
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  </div>
);
