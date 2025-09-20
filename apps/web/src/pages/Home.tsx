import { useQuery } from "@tanstack/react-query";
import type { FC } from "react";
import { Grid } from "@/components/Grid";
import { type Screenshot, View } from "@/types";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { List } from "@/components/List";

export const Home: FC = () => {
  const [search] = useQueryState("search");
  const [view] = useQueryState("view", parseAsStringEnum<View>(Object.values(View)));
  
  const ScreenshotComponent = view === View.Grid ? Grid : List;

  const { data, isPending, isError } = useQuery<Screenshot[]>({
    queryKey: ["screenshots", search],
    queryFn: () => {
      if (!search) {
        return fetch("/api/screenshots").then((res) => res.json());
      }
      return fetch(`/api/screenshots?search=${search}`).then((res) => res.json());
    },
  });

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Error fetching screenshots</div>;
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h3 className="text-2xl font-bold">Changed</h3>
        <ScreenshotComponent
          screenshots={data.filter((screenshot) => screenshot.category === "changed")}
          category="changed"
        />
      </div>
      <div className="space-y-3">
        <h3 className="text-2xl font-bold">New</h3>
      <ScreenshotComponent
        screenshots={data.filter((screenshot) => screenshot.category === "new")}
        category="new"
      />
      </div>
      <div className="space-y-3">
        <h3 className="text-2xl font-bold">Deleted</h3>
      <ScreenshotComponent
        screenshots={data.filter((screenshot) => screenshot.category === "deleted")}
        category="deleted"
      />
      </div>
      <div className="space-y-3">
        <h3 className="text-2xl font-bold">Passed</h3>
      <ScreenshotComponent
        screenshots={data.filter((screenshot) => screenshot.category === "passed")}
        category="passed"
      />
      </div>
    </div>
  );
};
