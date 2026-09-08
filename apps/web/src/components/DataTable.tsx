import {
  type CellData,
  type ColumnDef,
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  filterFn_includesString,
  type OnChangeFn,
  type RowData,
  type RowSelectionState,
  rowSelectionFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components/table";

/**
 * The features this table opts into. Declared statically outside the component
 * so the feature set — and everything inferred from it — stays stable.
 */
export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
});

export type DataTableFeatures = typeof dataTableFeatures;

/** `ColumnDef` bound to the feature set {@link DataTable} registers. */
export type DataTableColumnDef<
  TData extends RowData,
  TValue extends CellData = CellData,
> = ColumnDef<DataTableFeatures, TData, TValue>;

interface DataTableProps<TData extends RowData, TValue extends CellData> {
  columns: DataTableColumnDef<TData, TValue>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
}

export function DataTable<TData extends RowData, TValue extends CellData>({
  columns,
  data,
  getRowId,
  rowSelection,
  onRowSelectionChange,
}: DataTableProps<TData, TValue>) {
  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    ...(getRowId && { getRowId }),
    ...(rowSelection !== undefined && {
      state: { rowSelection },
      onRowSelectionChange,
      enableRowSelection: true,
    }),
  });

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
