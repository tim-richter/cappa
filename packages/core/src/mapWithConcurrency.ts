/**
 * Run async work over `items` with at most `concurrency` tasks in flight.
 * Preserves failure behavior: the first rejection rejects the returned promise.
 * Results are returned in the same order as the input items.
 */
export async function mapWithConcurrency<T, R = void>(
  concurrency: number,
  items: readonly T[],
  fn: (item: T, workerIndex: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const limit = Math.max(1, concurrency);
  const workerCount = Math.min(limit, items.length);
  const results: R[] = new Array(items.length);
  let next = 0;

  const worker = async (workerIndex: number): Promise<void> => {
    while (true) {
      const i = next++;
      if (i >= items.length) {
        return;
      }
      const item = items[i];
      if (item === undefined) {
        return;
      }
      results[i] = await fn(item, workerIndex);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, (_, i) => worker(i)));

  return results;
}
