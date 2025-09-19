import { useQuery } from "@tanstack/react-query";
import type { FC } from "react";
import { Grid } from "@/components/Grid";
import type { ScreenshotPaths } from "@/types";

export const Home: FC = () => {
  const { data, isPending, isError } = useQuery<ScreenshotPaths>({
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
    <Grid
      screenshots={data.actual}
      selectedScreenshot={null}
      onScreenshotSelect={() => {}}
    />
  );
};
