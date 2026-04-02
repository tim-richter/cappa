import type { Screenshot } from "@cappa/core";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@ui/lib/utils";
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

export const Deleted: FC = () => {
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [view] = useQueryState(
    "view",
    parseAsStringEnum<View>(Object.values(View)),
  );
  const activeView = view ?? View.List;
  const ScreenshotComponent = activeView === View.Grid ? Grid : List;
  const { data, isPending, isError } = useQuery<Screenshot[]>({
    queryKey: ["screenshots", "deleted"],
    queryFn: () =>
      fetch("/api/screenshots?category=deleted").then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      }),
  });
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
    if (!data?.length) return;
    approveBatch(
      data.map((s) => s.name),
      {
        onSuccess: () => {
          setSelectedIds(new Set());
          setIsSelectMode(false);
        },
      },
    );
  }, [data, approveBatch]);

  const handleSelectAll = useCallback(() => {
    if (!data) return;
    setSelectedIds(new Set(data.map((s) => s.id)));
  }, [data]);

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Error fetching screenshots</div>;
  }

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
      category="deleted"
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
        <ScreenshotComponent
          screenshots={data}
          category="deleted"
          selection={isSelectMode ? selection : undefined}
          showCheckboxes={isSelectMode}
        />
      </Main>
    </>
  );
};
