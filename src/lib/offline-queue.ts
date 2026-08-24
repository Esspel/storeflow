const KEY = "sf-offline-queue";

export type QueuedOp = {
  fn: string;
  args: unknown;
  timestamp: number;
  retryCount: number;
};

export function enqueue(item: QueuedOp): void {
  const current = read();
  current.push(item);
  localStorage.setItem(KEY, JSON.stringify(current));
}

export function dequeueAll(): QueuedOp[] {
  const current = read();
  localStorage.removeItem(KEY);
  return current;
}

export function getQueueLength(): number {
  return read().length;
}

export function clearQueue(): void {
  localStorage.removeItem(KEY);
}

function read(): QueuedOp[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedOp[]) : [];
  } catch {
    return [];
  }
}
