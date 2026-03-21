/**
 * Run async work over `items` with at most `concurrency` tasks in flight.
 * Preserves failure behavior: the first rejection rejects the returned promise.
 */
export async function mapWithConcurrency<T>(
  concurrency: number,
  items: readonly T[],
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const limit = Math.max(1, concurrency);
  const workerCount = Math.min(limit, items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const i = next++;
      if (i >= items.length) {
        return;
      }
      const item = items[i];
      if (item === undefined) {
        return;
      }
      await fn(item);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}
