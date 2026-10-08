/**
 * Async Utilities - concurrency-limited task execution
 *
 * Utility for running many async tasks with a bounded concurrency limit.
 * Avoids overwhelming the browser, Chrome Extension message port, or
 * upstream servers with thousands of simultaneous requests.
 */

export interface ConcurrencyPoolOptions {
  /** Maximum number of tasks that may run concurrently. */
  concurrency: number;
  /** Optional delay (ms) between starting each batch. */
  batchDelayMs?: number;
}

/**
 * Run an array of async tasks with a bounded concurrency limit.
 *
 * Tasks are started in waves of `concurrency` at a time. Each task
 * receives its index so callers can map results back to the original
 * input order if needed.
 *
 * Returns an array of settled results in the same order as the input tasks.
 */
export async function runWithConcurrency<T, R = T>(
  items: T[],
  taskFn: (item: T, index: number) => Promise<R>,
  options: ConcurrencyPoolOptions,
): Promise<R[]> {
  const { concurrency, batchDelayMs = 0 } = options;
  if (!items || !Array.isArray(items)) return [];
  const results: R[] = new Array(items.length);

  if (items.length === 0) return results;

  const limit = Math.max(1, concurrency);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await taskFn(items[currentIndex], currentIndex);
      if (batchDelayMs > 0 && index < items.length) {
        await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
      }
    }
  }

  // Start `limit` workers; they pull from the shared index counter.
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * Like `runWithConcurrency` but swallows per-task rejections and returns
 * a structured result set instead of throwing on the first failure.
 */
export async function runWithConcurrencySettled<T, R = T>(
  items: T[],
  taskFn: (item: T, index: number) => Promise<R>,
  options: ConcurrencyPoolOptions,
): Promise<Array<{ status: "fulfilled"; value: R } | { status: "rejected"; reason: unknown }>> {
  const { concurrency, batchDelayMs = 0 } = options;
  if (!items || !Array.isArray(items)) return [];
  const results: Array<
    { status: "fulfilled"; value: R } | { status: "rejected"; reason: unknown }
  > = new Array(items.length);

  if (items.length === 0) return results;

  const limit = Math.max(1, concurrency);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index++;
      try {
        const value = await taskFn(items[currentIndex], currentIndex);
        results[currentIndex] = { status: "fulfilled", value };
      } catch (err) {
        results[currentIndex] = { status: "rejected", reason: err };
      }
      if (batchDelayMs > 0 && index < items.length) {
        await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * Split an array into chunks of at most `size` elements.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  if (!items || !Array.isArray(items)) return [];
  const chunkSize = Math.max(1, size);
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}
