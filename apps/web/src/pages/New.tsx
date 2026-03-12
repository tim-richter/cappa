import type { Screenshot } from "@cappa/core";
import { useQuery } from "@tanstack/react-query";
import type { FC } from "react";
import { useCallback, useState } from "react";
import { BatchApproveBar } from "@/components/BatchApproveBar";
import { Grid } from "@/components/Grid";
import { useApproveBatch } from "@/hooks/useApproveBatch";
import { Header } from "@/layout/Header";
import { Main } from "@/layout/Main";
export const New: FC = () => {
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data, isPending, isError } = useQuery<Screenshot[]>({
    queryKey: ["screenshots", "new"],
    queryFn: () =>
      fetch("/api/screenshots?category=new").then((res) => res.json()),
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
  const handleApproveAll = useCallback(() => {
    if (!data?.length) return;
    approveBatch(
      data.map((s) => s.name),
      { onSuccess: () => setSelectedIds(new Set()) },
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
      category="new"
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
        <Grid
          screenshots={data}
          category="new"
          selection={isSelectMode ? selection : undefined}
          showCheckboxes={isSelectMode}
        />
      </Main>
    </>
  );
};
