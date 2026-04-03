import type { Screenshot } from "@cappa/core";
import { useQuery } from "@tanstack/react-query";
import { parseAsStringEnum, useQueryState } from "nuqs";
import type { FC } from "react";
import { Grid } from "@/components/Grid";
import { List } from "@/components/List";
import { Header } from "@/layout/Header";
import { Main } from "@/layout/Main";
import { View } from "@/types";

export const Passed: FC = () => {
  const [view] = useQueryState(
    "view",
    parseAsStringEnum<View>(Object.values(View)),
  );
  const activeView = view ?? View.List;
  const ScreenshotComponent = activeView === View.Grid ? Grid : List;
  const { data, isPending, isError } = useQuery<Screenshot[]>({
    queryKey: ["screenshots", "passed"],
    queryFn: () =>
      fetch("/api/screenshots?category=passed").then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      }),
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
        <ScreenshotComponent screenshots={data} category="passed" />
      </Main>
    </>
  );
};
