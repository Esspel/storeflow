const MAX = 100;
let buffer: string[] = [];
let initialized = false;

export function initErrorCapture(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("error", (e) => captureError(e.error ?? new Error(e.message)));
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
    captureError(reason);
  });
}

export function captureError(err: Error): void {
  const entry = `[${new Date().toISOString()}] ${err.message}\n${err.stack ?? ""}`.slice(0, 2000);
  buffer.push(entry);
  if (buffer.length > MAX) buffer = buffer.slice(-MAX);
}

export function getRecentErrors(): string[] {
  return [...buffer];
}

export function consumeLastCapturedError(): string | null {
  if (buffer.length === 0) return null;
  return buffer.pop() ?? null;
}
