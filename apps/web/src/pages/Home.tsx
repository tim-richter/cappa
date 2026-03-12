import type { Screenshot } from "@cappa/core";
import { useQuery } from "@tanstack/react-query";
import { parseAsStringEnum, useQueryState } from "nuqs";
import type { FC } from "react";
import { useCallback, useState } from "react";
import { BatchApproveBar } from "@/components/BatchApproveBar";
import { Grid } from "@/components/Grid";
import { List } from "@/components/List";
import { useApproveBatch } from "@/hooks/useApproveBatch";
import { Header } from "@/layout/Header";
import { Main } from "@/layout/Main";
import { View } from "@/types";

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

  const { data, isPending, isError } = useQuery<Screenshot[]>({
    queryKey: ["screenshots", search],
    queryFn: () => {
      if (!search) {
        return fetch("/api/screenshots").then((res) => res.json());
      }
      return fetch(`/api/screenshots?search=${search}`).then((res) =>
        res.json(),
      );
    },
  });

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
    if (!data) return;

    const ids = data
      .filter((s) =>
        ["changed", "new", "deleted"].includes(s.category as string),
      )
      .map((s) => s.id);
    setSelectedIds(new Set(ids));
  }, [data]);

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Error fetching screenshots</div>;
  }

  const changedScreenshots = data.filter((s) => s.category === "changed");
  const newScreenshots = data.filter((s) => s.category === "new");
  const deletedScreenshots = data.filter((s) => s.category === "deleted");
  const passedScreenshots = data.filter((s) => s.category === "passed");

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
      screenshots={data}
      onSelectAll={handleSelectAll}
      onApproveSelected={handleApproveSelected}
      onApproveAll={() => {}}
      onClearSelection={() => setSelectedIds(new Set())}
      isPending={isApprovePending}
    />
  );
  return (
    <>
      <Header actions={approveBar} />

      <Main>
        <div className="flex flex-col gap-4">
          <div className="space-y-3">
            <h3 className="text-2xl font-bold">New</h3>
            <ScreenshotComponent
              screenshots={newScreenshots}
              category="new"
              selection={isSelectMode ? selection : undefined}
              showCheckboxes={isSelectMode}
            />
          </div>
          <div className="space-y-3">
            <h3 className="text-2xl font-bold">Deleted</h3>
            <ScreenshotComponent
              screenshots={deletedScreenshots}
              category="deleted"
              selection={isSelectMode ? selection : undefined}
              showCheckboxes={isSelectMode}
            />
          </div>
          <div className="space-y-3">
            <h3 className="text-2xl font-bold">Changed</h3>
            <ScreenshotComponent
              screenshots={changedScreenshots}
              category="changed"
              selection={isSelectMode ? selection : undefined}
              showCheckboxes={isSelectMode}
            />
          </div>
          <div className="space-y-3">
            <h3 className="text-2xl font-bold">Passed</h3>
            <ScreenshotComponent
              screenshots={passedScreenshots}
              category="passed"
            />
          </div>
        </div>
      </Main>
    </>
  );
};
