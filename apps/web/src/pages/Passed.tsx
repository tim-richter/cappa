import { parseAsStringEnum, useQueryState } from "nuqs";
import type { FC } from "react";
import { useScreenshotsByCategory } from "@/api/hooks";
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
  const { data, isPending, isError } = useScreenshotsByCategory("passed");

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
