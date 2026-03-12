import type { Screenshot } from "@cappa/core";
import { useQuery } from "@tanstack/react-query";
import type { FC } from "react";
import { Grid } from "@/components/Grid";
import { Header } from "@/layout/Header";
import { Main } from "@/layout/Main";

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

  return (
    <>
      <Header />

      <Main>
        <Grid screenshots={data} category="passed" />
      </Main>
    </>
  );
};
