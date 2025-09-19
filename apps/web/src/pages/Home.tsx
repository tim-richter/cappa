import { Grid } from "@/components/Grid";
import type { FC } from "react";

export const Home: FC = () => {
  return (
      <Grid screenshots={[{
        id: "1",
        name: "Screenshot 1",
        url: "https://picsum.photos/200/300",
        category: "changed",
        timestamp: new Date(),
      }]} selectedScreenshot={null} onScreenshotSelect={() => {}} />
  );
};
