import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ui/components/tooltip";
import { RefreshCw } from "lucide-react";
import type { FC } from "react";
import { invalidateReviewQueries, screenshotKeys } from "@/api/hooks";

/**
 * Re-read every screenshot from the server.
 *
 * The server rebuilds its index from disk on every request, so all this has to
 * do is drop the cached answers — anything written to `outputDir` since (a
 * re-capture, a watch run, `cappa capture` in another terminal) shows up
 * without restarting `cappa review`.
 */
export const ReloadButton: FC = () => {
  const queryClient = useQueryClient();
  const fetching =
    useIsFetching({ queryKey: screenshotKeys.all }) +
      useIsFetching({ queryKey: screenshotKeys.details }) >
    0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Reload screenshots"
          className="h-7 w-7 p-0"
          disabled={fetching}
          onClick={() => invalidateReviewQueries(queryClient)}
        >
          <RefreshCw className={fetching ? "size-4 animate-spin" : "size-4"} />
        </Button>
      </TooltipTrigger>

      <TooltipContent>Reload screenshots</TooltipContent>
    </Tooltip>
  );
};
