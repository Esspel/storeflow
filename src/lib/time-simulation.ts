const STORAGE_KEY = "sf_time_offset_ms";

export function getTimeOffsetMs(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
}

export function setTimeOffsetMs(ms: number): void {
  try {
    if (ms === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, String(ms));
    }
    window.dispatchEvent(new CustomEvent("sf-time-changed"));
  } catch {}
}

export function getSimulatedDate(): Date {
  return new Date(Date.now() + getTimeOffsetMs());
}

export function getSimulatedNow(): number {
  return Date.now() + getTimeOffsetMs();
}

export function isSimulationActive(): boolean {
  return getTimeOffsetMs() !== 0;
}
