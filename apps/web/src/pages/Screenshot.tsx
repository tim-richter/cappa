import type { FC } from "react";
import { useNavigate, useParams } from "react-router";
import { useScreenshot } from "@/api/hooks";
import { ScreenshotComparison } from "@/components/ScreenshotViewer/ScreenshotViewer";

export const Screenshot: FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isPending, isError } = useScreenshot(id);

  if (isPending) {
    return <div>Loading...</div>;
  }

  // `useScreenshot` resolves to `undefined` for an id the server does not
  // have, rather than rejecting, so a settled `undefined` is a 404.
  if (isError || !data) {
    return <div>Error fetching screenshot</div>;
  }

  return (
    <ScreenshotComparison screenshot={data} onBack={() => navigate("/")} />
  );
};
