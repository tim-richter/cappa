import type { Screenshot } from "@cappa/core";
import { Button } from "@ui/components/button";
import { Check } from "lucide-react";
import type { FC } from "react";

const APPROVABLE_CATEGORIES = new Set(["new", "changed", "deleted"]);

export interface BatchApproveBarProps {
  isSelectMode: boolean;
  onSelectModeChange: (active: boolean) => void;
  selectedIds: Set<string>;
  screenshots: Screenshot[];
  category?: "changed" | "new" | "deleted" | "passed";
  onSelectAll: () => void;
  onApproveSelected: (names: string[]) => void;
  onApproveAll: () => void;
  onClearSelection: () => void;
  isPending?: boolean;
}

export const BatchApproveBar: FC<BatchApproveBarProps> = ({
  isSelectMode,
  onSelectModeChange,
  selectedIds,
  screenshots,
  onSelectAll,
  onApproveSelected,
  isPending = false,
}) => {
  const approvableScreenshots = screenshots.filter((s) =>
    APPROVABLE_CATEGORIES.has(s.category as "new" | "changed" | "deleted"),
  );
  const showBar = approvableScreenshots.length > 0;

  if (!showBar) return null;

  const selectedScreenshots = screenshots.filter((s) => selectedIds.has(s.id));
  const approvableSelected = selectedScreenshots.filter((s) =>
    APPROVABLE_CATEGORIES.has(s.category as "new" | "changed" | "deleted"),
  );
  const namesToApprove = approvableSelected.map((s) => s.name);
  const canApproveSelected = namesToApprove.length > 0 && !isPending;

  if (!isSelectMode) {
    return (
      <div className="flex items-center justify-center gap-1">
        <Button
          variant="secondary"
          size="sm"
          className="h-7"
          onClick={() => onSelectModeChange(true)}
        >
          Select
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-7"
        onClick={() => onSelectModeChange(false)}
      >
        Cancel
      </Button>
      <Button
        variant="secondary"
        size="sm"
        className="h-7"
        onClick={onSelectAll}
        disabled={approvableScreenshots.length === 0}
      >
        Select all
      </Button>
      <span className="text-sm text-muted-foreground px-1">
        {selectedIds.size} selected
      </span>
      <Button
        size="sm"
        className="h-7 gap-2 text-green-700 bg-green-100 hover:bg-green-200 dark:text-green-300 dark:bg-green-900/50 dark:hover:bg-green-800/50"
        onClick={() => onApproveSelected(namesToApprove)}
        disabled={!canApproveSelected}
      >
        <Check className="h-4 w-4" />
        Approve selected ({namesToApprove.length})
      </Button>
    </div>
  );
};
