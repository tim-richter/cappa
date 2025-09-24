import type { ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router";
import type { Screenshot } from "@/types";
import { DataTable } from "./DataTable";

const columns: ColumnDef<Screenshot>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      return (
        <Link to={`/screenshots/${row.original.id}`}>{row.original.name}</Link>
      );
    },
  },
];

export const List = ({ screenshots }: { screenshots: Screenshot[] }) => {
  return <DataTable columns={columns} data={screenshots} />;
};
