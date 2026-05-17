let _timeOffset = 0;

export function getTimeOffsetMs(): number {
  return _timeOffset;
}

export function setTimeOffsetMs(ms: number): void {
  _timeOffset = ms;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sf-time-changed"));
  }
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
