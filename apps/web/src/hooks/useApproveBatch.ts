import type { ApproveResult } from "@cappa/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@ui/lib/utils";
import { client } from "@/api/client";
import { invalidateReviewQueries } from "@/api/hooks";

/**
 * Did every name in the request actually get approved?
 *
 * A per-name failure comes back inside a `200` — the request succeeded, the
 * approval did not — so "the mutation resolved" is not the same thing as "the
 * screenshot is approved". Callers that move on afterwards (clearing a
 * selection, navigating away from an approved deletion) have to ask this
 * first, or they throw away the selection the user needs to retry.
 */
export const isFullyApproved = (result: ApproveResult) =>
  result.errors.length === 0;

/** How many names a failure message lists before it starts counting. */
const MAX_LISTED_ERRORS = 3;

const describeApproved = (approved: string[]) =>
  approved.length === 1
    ? `Approved ${approved[0]}`
    : `Approved ${approved.length} screenshots`;

const describeApproveErrors = ({ approved, errors }: ApproveResult) => {
  if (errors.length === 1) {
    const [failure] = errors;
    return `Failed to approve ${failure.name}: ${failure.error}`;
  }

  const listed = errors.slice(0, MAX_LISTED_ERRORS).map((e) => e.name);
  const rest = errors.length - listed.length;
  const names =
    rest > 0 ? `${listed.join(", ")} and ${rest} more` : listed.join(", ");

  return `Failed to approve ${errors.length} of ${
    errors.length + approved.length
  } screenshots: ${names}`;
};

/**
 * Approve screenshots by name — the one approve mutation this UI has.
 *
 * Single approve is this with one name, so both surfaces report the outcome
 * the same way rather than each inventing its own feedback (or, as the detail
 * view did, none at all). Three outcomes, all of them visible:
 *
 * - every name approved — a success toast;
 * - some names rejected by the engine, inside a `200` — an error toast naming
 *   them, because `fetch` resolving says nothing about the approval;
 * - the request itself failed — reported by the query client's global mutation
 *   error handler, see `createQueryClient`.
 *
 * Approving changes a screenshot's category, so every review query goes stale
 * at once — see `invalidateReviewQueries`.
 */
export function useApproveBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (names: string[]) => client.approve(names),
    onSuccess: (result) => {
      invalidateReviewQueries(queryClient);

      if (isFullyApproved(result)) {
        toast.success(describeApproved(result.approved));
        return;
      }

      toast.error(describeApproveErrors(result));
    },
  });
}
