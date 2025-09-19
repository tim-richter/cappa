import { useQuery } from "@tanstack/react-query";
import type { FC } from "react";
import { Grid } from "@/components/Grid";
import type { Screenshot } from "@/types";

export const Home: FC = () => {
  const { data, isPending, isError } = useQuery<Screenshot[]>({
    queryKey: ["screenshots"],
    queryFn: () => fetch("/api/screenshots").then((res) => res.json()),
  });

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Error fetching screenshots</div>;
  }

  return (
    <div>
      <h3 className="text-2xl font-bold px-6 pt-4">Changed</h3>
      <Grid
        screenshots={data.filter((screenshot) => screenshot.category === "changed")}
        selectedScreenshot={null}
        onScreenshotSelect={() => {}}
        category="changed"
      />
      <h3 className="text-2xl font-bold px-6 pt-4">New</h3>
      <Grid
        screenshots={data.filter((screenshot) => screenshot.category === "new")}
        selectedScreenshot={null}
        onScreenshotSelect={() => {}}
        category="new"
      />
      <h3 className="text-2xl font-bold px-6 pt-4">Deleted</h3>
      <Grid
        screenshots={data.filter((screenshot) => screenshot.category === "deleted")}
        selectedScreenshot={null}
        onScreenshotSelect={() => {}}
        category="deleted"
      />
      <h3 className="text-2xl font-bold px-6 pt-4">Passed</h3>
      <Grid
        screenshots={data.filter((screenshot) => screenshot.category === "passed")}
        selectedScreenshot={null}
        onScreenshotSelect={() => {}}
        category="passed"
      />
    </div>
  );
};
