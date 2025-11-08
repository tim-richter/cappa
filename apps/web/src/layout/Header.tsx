import type { Screenshot } from "@cappa/core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ui/components/tooltip";
import { Grid3X3, List, Search } from "lucide-react";
import { debounce, parseAsStringEnum, useQueryState } from "nuqs";
import type { FC } from "react";
import { useLocation } from "react-router";
import { View } from "@/types";
export type ScreenshotCategory = "changed" | "new" | "deleted" | "passed";

const categoryLabels = {
  changed: "Changed Screenshots",
  new: "New Screenshots",
  deleted: "Deleted Screenshots",
  passed: "Passed Screenshots",
};

export const Header: FC = () => {
  const { pathname } = useLocation();
  const category = pathname.split("/")[1] as ScreenshotCategory;
  const { data: count } = useQuery({
    queryKey: ["screenshots", category],
    queryFn: () => {
      return fetch(`/api/screenshots?category=${category}`).then(
        (res) => res.json() as unknown as Promise<Screenshot[]>,
      );
    },
    select: (data) => data?.length || 0,
  });
  const [search, setSearch] = useQueryState("search");
  const [view, setView] = useQueryState(
    "view",
    parseAsStringEnum<View>(Object.values(View)),
  );

  return (
    <div className="border-b border-border bg-card">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-card-foreground">
              {categoryLabels[category]}
            </h2>
            <p className="text-muted-foreground">
              {count} screenshot(s) in this category
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search || ""}
              placeholder="Search screenshots..."
              className="pl-10"
              onChange={(e) => {
                setSearch(e.target.value || null, {
                  // Send immediate update if resetting, otherwise debounce at 500ms
                  limitUrlUpdates:
                    e.target.value === "" ? undefined : debounce(500),
                });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setSearch(e.currentTarget.value);
                }
              }}
            />
          </div>

          <div className="flex items-center justify-center gap-1 border border-border rounded-lg p-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Grid view"
                  variant={view === View.Grid ? "primary" : "ghost"}
                  size="sm"
                  className="h-7 w-7 p-0 flex items-center justify-center"
                  onClick={() => setView(View.Grid)}
                >
                  <Grid3X3 size={16} />
                </Button>
              </TooltipTrigger>

              <TooltipContent>Grid view</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="List view"
                  variant={view === View.List ? "primary" : "ghost"}
                  size="sm"
                  className="h-7 w-7 p-0 flex items-center justify-center"
                  onClick={() => setView(View.List)}
                >
                  <List size={16} />
                </Button>
              </TooltipTrigger>

              <TooltipContent>List view</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
};
