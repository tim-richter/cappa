import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { Filter, Grid3X3, List, Search } from "lucide-react";
import type { FC } from "react";
import { useLocation } from "react-router";

export type ScreenshotCategory = "changed" | "new" | "deleted" | "passed";

interface HeaderProps {
  category: ScreenshotCategory;
  count: number;
}

const categoryLabels = {
  changed: "Changed Screenshots",
  new: "New Screenshots",
  deleted: "Deleted Screenshots",
  passed: "Passed Screenshots",
};

export const Header: FC<HeaderProps> = () => {
  const { pathname } = useLocation();
  const category = pathname.split("/")[1] as ScreenshotCategory;
  const count = 10;

  return (
    <div className="border-b border-border bg-card">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-card-foreground">
              {categoryLabels[category]}
            </h2>
            <p className="text-muted-foreground">
              {count} {count === 1 ? "screenshot" : "screenshots"} in this
              category
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search screenshots..." className="pl-10" />
          </div>

          <div className="flex items-center gap-1 border border-border rounded-lg p-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
