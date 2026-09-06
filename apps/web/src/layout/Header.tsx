import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ui/components/tooltip";
import { Grid3X3, List, Search } from "lucide-react";
import { debounce, parseAsStringEnum, useQueryState } from "nuqs";
import type { FC, ReactNode } from "react";
import { useLocation } from "react-router";
import { useScreenshotCount } from "@/api/hooks";
import { View } from "@/types";
export type ScreenshotCategory = "changed" | "new" | "deleted" | "passed";

const categoryLabels: Record<ScreenshotCategory, string> = {
  changed: "Changed Screenshots",
  new: "New Screenshots",
  deleted: "Deleted Screenshots",
  passed: "Passed Screenshots",
};

const isCategory = (value: string): value is ScreenshotCategory =>
  Object.hasOwn(categoryLabels, value);

/**
 * The category this header is showing, or `undefined` on the home page, which
 * lists every screenshot and has no category segment.
 *
 * The path segment cannot simply be asserted to be a category: on `/` it is
 * `""`, and the server rejects `?category=` with a `400` — which left the
 * heading blank and the count empty on the one page every user opens first.
 */
const categoryFromPath = (pathname: string): ScreenshotCategory | undefined => {
  const segment = pathname.split("/")[1] ?? "";
  return isCategory(segment) ? segment : undefined;
};

export interface HeaderProps {
  actions?: ReactNode;
}

export const Header: FC<HeaderProps> = ({ actions }) => {
  const { pathname } = useLocation();
  const category = categoryFromPath(pathname);
  const { data: count } = useScreenshotCount(category);
  const [search, setSearch] = useQueryState("search");
  const [view, setView] = useQueryState(
    "view",
    parseAsStringEnum<View>(Object.values(View)),
  );
  const activeView = view ?? View.List;

  return (
    <div className="border-b border-border bg-card">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-card-foreground">
              {category ? categoryLabels[category] : "All Screenshots"}
            </h2>
            <p className="text-muted-foreground">
              {count} screenshot(s){category ? " in this category" : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row items-start lg:items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />

              <Input
                value={search || ""}
                placeholder="Search screenshots..."
                className="pl-10 w-[300px]"
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
                    variant={activeView === View.Grid ? "primary" : "ghost"}
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
                    variant={activeView === View.List ? "primary" : "ghost"}
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

          {actions != null ? (
            <div className="flex items-center shrink-0 h-7">{actions}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
