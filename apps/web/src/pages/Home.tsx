import type { Screenshot, ScreenshotCategory } from "@cappa/protocol";
import { parseAsStringEnum, useQueryState } from "nuqs";
import type { FC } from "react";
import { useCallback, useState } from "react";
import { useScreenshotSearch } from "@/api/hooks";
import { BatchApproveBar } from "@/components/BatchApproveBar";
import { EmptyState } from "@/components/EmptyState";
import { Grid } from "@/components/Grid";
import { List } from "@/components/List";
import { QueryState } from "@/components/QueryState";
import { useApproveBatch } from "@/hooks/useApproveBatch";
import { Header } from "@/layout/Header";
import { Main } from "@/layout/Main";
import { View } from "@/types";

const SECTIONS: { category: ScreenshotCategory; label: string }[] = [
  { category: "new", label: "New" },
  { category: "deleted", label: "Deleted" },
  { category: "changed", label: "Changed" },
  { category: "passed", label: "Passed" },
];

const APPROVABLE_CATEGORIES: ScreenshotCategory[] = [
  "changed",
  "new",
  "deleted",
];

export const Home: FC = () => {
  const [search] = useQueryState("search");
  const [view] = useQueryState(
    "view",
    parseAsStringEnum<View>(Object.values(View)),
  );
  const activeView = view ?? View.List;
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const ScreenshotComponent = activeView === View.Grid ? Grid : List;

  const query = useScreenshotSearch(search);
  const screenshots = query.data ?? [];

  const { mutate: approveBatch, isPending: isApprovePending } =
    useApproveBatch();

  const handleApproveSelected = useCallback(
    (names: string[]) => {
      approveBatch(names, {
        onSuccess: () => setSelectedIds(new Set()),
      });
    },
    [approveBatch],
  );

  const handleSelectAll = useCallback(() => {
    const ids = screenshots
      .filter((s) => APPROVABLE_CATEGORIES.includes(s.category))
      .map((s) => s.id);
    setSelectedIds(new Set(ids));
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
      onSelectAll={handleSelectAll}
      onApproveSelected={handleApproveSelected}
      onApproveAll={() => {}}
      onClearSelection={() => setSelectedIds(new Set())}
      isPending={isApprovePending}
    />
  );

  const renderSections = (data: Screenshot[]) => {
    // One overview of four categories, so an empty category is a missing
    // section rather than four stacked "nothing here" cards — but a page with
    // nothing at all still has to say so.
    if (data.length === 0) {
      return (
        <EmptyState
          description={
            search
              ? `No screenshots match “${search}”.`
              : "Run `cappa capture` to capture some."
          }
        />
      );
    }

    return SECTIONS.map(({ category, label }) => {
      const sectionScreenshots = data.filter((s) => s.category === category);
      if (sectionScreenshots.length === 0) return null;

      const selectable = isSelectMode && category !== "passed";

      return (
        <div key={category} className="space-y-3">
          <h3 className="text-2xl font-bold">{label}</h3>
          <ScreenshotComponent
            screenshots={sectionScreenshots}
            category={category}
            selection={selectable ? selection : undefined}
            showCheckboxes={selectable}
          />
        </div>
      );
    });
  };

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
            <div className="flex flex-col gap-4">{renderSections(data)}</div>
          )}
        </QueryState>
      </Main>
    </>
  );
};
