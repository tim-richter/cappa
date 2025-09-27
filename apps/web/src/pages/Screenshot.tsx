import { useQuery } from "@tanstack/react-query";
import type { FC } from "react";
import { useNavigate, useParams } from "react-router";
import { ScreenshotComparison } from "@/components/ScreenshotViewer/ScreenshotViewer";

export const Screenshot: FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isPending, isError } = useQuery({
    queryKey: ["screenshot", id],
    queryFn: () => fetch(`/api/screenshots/${id}`).then((res) => res.json()),
  });

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Error fetching screenshot</div>;
  }

  return (
    <ScreenshotComparison screenshot={data} onBack={() => navigate("/")} />
  );
};
