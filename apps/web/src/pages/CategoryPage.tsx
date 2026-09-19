import type { ScreenshotCategory } from "@cappa/protocol";
import { toast } from "@ui/lib/utils";
import { parseAsStringEnum, useQueryState } from "nuqs";
import type { FC } from "react";
import { useCallback, useState } from "react";
import { useScreenshotsByCategory } from "@/api/hooks";
import { BatchApproveBar } from "@/components/BatchApproveBar";
import { Grid } from "@/components/Grid";
import { List } from "@/components/List";
import { QueryState } from "@/components/QueryState";
import { useApproveBatch } from "@/hooks/useApproveBatch";
import { Header } from "@/layout/Header";
import { Main } from "@/layout/Main";
import { View } from "@/types";

/**
 * One category of screenshots, in whichever view the URL asks for.
 *
 * The four category pages differed only in the string they passed to the
 * query and to the approve bar, so they shared four copies of the same bug:
 * fixing the loading and error states in one of them fixed nothing anywhere
 * else. `BatchApproveBar` hides itself when nothing on the page can be
 * approved, which is what keeps this usable for `passed` too.
 */
export const CategoryPage: FC<{ category: ScreenshotCategory }> = ({
  category,
}) => {
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [view] = useQueryState(
    "view",
    parseAsStringEnum<View>(Object.values(View)),
  );
  const activeView = view ?? View.List;
  const ScreenshotComponent = activeView === View.Grid ? Grid : List;
  const query = useScreenshotsByCategory(category);
  // The header and the approve bar render beside the list rather than instead
  // of it, so they have to cope with a query that has not answered yet.
  const screenshots = query.data ?? [];
  const { mutate: approveBatch, isPending: isApprovePending } =
    useApproveBatch();

  const handleApproveSelected = useCallback(
    (names: string[]) => {
      approveBatch(names, {
        onSuccess: ({ approved, errors }) => {
          if (errors.length > 0) {
            toast.error(
              `Failed to approve ${errors.length} screenshots: ${errors.join(", ")}`,
            );
            return;
          }

          setSelectedIds(new Set());
          setIsSelectMode(false);
          toast.success(`${approved.length} screenshots approved`);
        },
      });
    },
    [approveBatch],
  );

  const handleApproveAll = useCallback(() => {
    if (screenshots.length === 0) return;
    approveBatch(
      screenshots.map((s) => s.name),
      {
        onSuccess: () => {
          setSelectedIds(new Set());
          setIsSelectMode(false);
        },
      },
    );
  }, [screenshots, approveBatch]);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(screenshots.map((s) => s.id)));
  }, [screenshots]);

  const selection = {
    selectedIds,
    onSelectionChange: setSelectedIds,
  };

  const approveBar = (
    <BatchApproveBar
      isSelectMode={isSelectMode}
      onSelectModeChange={(active) => {
        setIsSelectMode(active);
        if (!active) setSelectedIds(new Set());
      }}
      selectedIds={selectedIds}
      screenshots={screenshots}
      category={category}
      onSelectAll={handleSelectAll}
      onApproveSelected={handleApproveSelected}
      onApproveAll={handleApproveAll}
      onClearSelection={() => setSelectedIds(new Set())}
      isPending={isApprovePending}
    />
  );

  return (
    <>
      <Header actions={approveBar} />

      <Main>
        <QueryState
          query={query}
          errorTitle="Couldn't load screenshots"
          loadingLabel="Loading screenshots"
        >
          {(data) => (
            <ScreenshotComponent
              screenshots={data}
              category={category}
              selection={isSelectMode ? selection : undefined}
              showCheckboxes={isSelectMode}
            />
          )}
        </QueryState>
      </Main>
    </>
  );
};
