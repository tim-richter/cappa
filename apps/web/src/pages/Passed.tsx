import { useQuery } from "@tanstack/react-query";
import type { FC } from "react";
import { Grid } from "@/components/Grid";
import type { Screenshot } from "@/types";

export const Passed: FC = () => {
  const { data, isPending, isError } = useQuery<Screenshot[]>({
    queryKey: ["screenshots", "passed"],
    queryFn: () =>
      fetch("/api/screenshots?category=passed").then((res) => res.json()),
  });

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Error fetching screenshots</div>;
  }

  return <Grid screenshots={data} category="passed" />;
};
