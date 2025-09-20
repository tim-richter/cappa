import type { ColumnDef } from "@tanstack/react-table";
import type { Screenshot } from "@/types";
import { DataTable } from "./DataTable";

const columns: ColumnDef<Screenshot>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
];

export const List = ({ screenshots }: { screenshots: Screenshot[] }) => {
  return <DataTable columns={columns} data={screenshots} />;
};
