import type { Screenshot } from "@cappa/core";
import { useQuery } from "@tanstack/react-query";
import type { FC } from "react";
import { Grid } from "@/components/Grid";

export const Changed: FC = () => {
  const { data, isPending, isError } = useQuery<Screenshot[]>({
    queryKey: ["screenshots", "changed"],
    queryFn: () =>
      fetch("/api/screenshots?category=changed").then((res) => res.json()),
  });

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Error fetching screenshots</div>;
  }

  return <Grid screenshots={data} category="changed" />;
};
