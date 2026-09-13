import { useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/api/client";
import { invalidateReviewQueries } from "@/api/hooks";

/**
 * Approve screenshots by name.
 *
 * Approving changes a screenshot's category, so every review query goes stale
 * at once — see `invalidateReviewQueries`.
 */
export function useApproveBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (names: string[]) => client.approve(names),
    onSuccess: () => invalidateReviewQueries(queryClient),
  });
}
