import { useQuery } from "@tanstack/react-query";
import type { FC } from "react";
import { Grid } from "@/components/Grid";
import type { Screenshot } from "@/types";

export const Deleted: FC = () => {
  const { data, isPending, isError } = useQuery<Screenshot[]>({
    queryKey: ["screenshots", "deleted"],
    queryFn: () =>
      fetch("/api/screenshots?category=deleted").then((res) => res.json()),
  });

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Error fetching screenshots</div>;
  }

  return <Grid screenshots={data} category="deleted" />;
};
