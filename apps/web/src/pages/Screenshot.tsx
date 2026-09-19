import type { FC } from "react";
import { useNavigate, useParams } from "react-router";
import { useScreenshot } from "@/api/hooks";
import { ErrorState, LoadingState, QueryState } from "@/components/QueryState";
import { ScreenshotComparison } from "@/components/ScreenshotViewer/ScreenshotViewer";
import { useReviewNavigation } from "@/hooks/useReviewNavigation";

/** This page has no surrounding chrome, so its states centre themselves. */
const FALLBACK_LAYOUT =
  "mx-auto flex h-screen max-w-lg flex-col justify-center p-6";

export const Screenshot: FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const query = useScreenshot(id);
  // Not `data.next`/`data.prev` directly: those are recomputed on every
  // response, so an approval reorders them out from under the cursor.
  const { next, prev } = useReviewNavigation(
    id,
    query.data?.next,
    query.data?.prev,
  );

  return (
    <QueryState
      query={query}
      className={FALLBACK_LAYOUT}
      errorTitle="Couldn't load this screenshot"
      loading={<LoadingState label="Loading screenshot" rows={3} />}
    >
      {(screenshot) =>
        // `useScreenshot` settles on `null` for an id the server does not
        // have, which is a 404 rather than a failure.
        screenshot ? (
          <ScreenshotComparison
            screenshot={screenshot}
            next={next}
            prev={prev}
            onBack={() => navigate("/")}
          />
        ) : (
          <div className={FALLBACK_LAYOUT}>
            <ErrorState
              title="Screenshot not found"
              description={`No screenshot with id ${id}. It may have been approved or removed since this link was made.`}
            />
          </div>
        )
      }
    </QueryState>
  );
};
