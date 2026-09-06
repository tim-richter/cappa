import { useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/api/client";
import { screenshotKeys } from "@/api/hooks";

/**
 * Approve screenshots by name.
 *
 * Both prefixes are invalidated because approving changes a screenshot's
 * category: the lists that group by category and the detail view both go
 * stale, and every review query key sits under one of the two.
 */
export function useApproveBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (names: string[]) => client.approve(names),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: screenshotKeys.all });
      queryClient.invalidateQueries({ queryKey: screenshotKeys.details });
    },
  });
}
