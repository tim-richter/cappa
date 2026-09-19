import type { Screenshot, ScreenshotCategory } from "@cappa/protocol";
import type { RowSelectionState, Updater } from "@tanstack/react-table";
import { cva } from "class-variance-authority";
import type { MouseEvent } from "react";
import { Link } from "react-router";
import { DataTable, type DataTableColumnDef } from "./DataTable";
import { EmptyState } from "./EmptyState";

export interface ScreenshotListSelectionProps {
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}

interface ListProps {
  screenshots: Screenshot[];
  /** Only used to pick the empty-state copy; rows carry their own category. */
  category?: ScreenshotCategory;
  selection?: ScreenshotListSelectionProps;
  showCheckboxes?: boolean;
}

export const List = ({
  screenshots,
  category,
  selection,
  showCheckboxes = false,
}: ListProps) => {
  const canSelect = showCheckboxes && selection;
  const rowSelection: RowSelectionState = canSelect
    ? Object.fromEntries(
        screenshots
          .filter((s) => selection.selectedIds.has(s.id))
          .map((s) => [s.id, true]),
      )
    : {};

  const columns: DataTableColumnDef<Screenshot>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => {
        const handleClick = canSelect
          ? (e: MouseEvent<HTMLAnchorElement>) => {
              e.preventDefault();
              if (!selection) return;
              const next = new Set(selection.selectedIds);
              if (next.has(row.original.id)) next.delete(row.original.id);
              else next.add(row.original.id);
              selection.onSelectionChange(next);
            }
          : undefined;

        const className = cva("text-card-foreground", {
          variants: {
            canSelect: {
              false: "hover:underline",
            },
          },
        });

        return (
          <Link
            className={className({
              canSelect: !!canSelect,
            })}
            to={`/screenshots/${row.original.id}`}
            onClick={handleClick}
          >
            {row.original.name}
          </Link>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={screenshots}
      getRowId={(row) => row.id}
      empty={<EmptyState category={category} className="border-none" />}
      rowSelection={canSelect ? rowSelection : undefined}
      onRowSelectionChange={
        canSelect && selection
          ? (
              updaterOrValue: Updater<RowSelectionState> | RowSelectionState,
            ) => {
              const next =
                typeof updaterOrValue === "function"
                  ? updaterOrValue(rowSelection)
                  : updaterOrValue;
              selection.onSelectionChange(
                new Set(screenshots.filter((s) => next[s.id]).map((s) => s.id)),
              );
            }
          : undefined
      }
    />
  );
};
