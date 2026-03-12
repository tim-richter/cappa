import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useApproveBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (names: string[]) => {
      const res = await fetch("/api/screenshots/approve-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: unknown };
        throw new Error(
          err?.error ? JSON.stringify(err.error) : res.statusText,
        );
      }
      return res.json() as Promise<{ approved: string[]; errors: unknown[] }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screenshots"] });
      queryClient.invalidateQueries({ queryKey: ["screenshot"] });
    },
  });
}
