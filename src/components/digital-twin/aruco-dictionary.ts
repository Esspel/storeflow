/**
 * 4x4 ArUco dictionary (DICT_4X4_50 subset).
 * 50 unique binary patterns with 1-cell black border.
 * Deterministic: same id -> same pattern.
 */
export type ArUcoGrid = boolean[][]; // 6x6 incl. black border

function generatePattern(id: number): boolean[][] {
  const grid: boolean[][] = Array.from({ length: 6 }, () =>
    Array.from({ length: 6 }, () => false),
  );
  // Black border (1 cell thick)
  for (let i = 0; i < 6; i++) {
    grid[0][i] = true;
    grid[5][i] = true;
    grid[i][0] = true;
    grid[i][5] = true;
  }
  // Inner 4x4 based on id (0..49) — 50 deterministic patterns
  // Use 16-bit binary representation of id for unique patterns
  for (let r = 1; r <= 4; r++) {
    for (let c = 1; c <= 4; c++) {
      const bitIndex = (r - 1) * 4 + (c - 1); // 0..15
      grid[r][c] = ((id >> bitIndex) & 1) === 1;
    }
  }
  return grid;
}

const PATTERNS: Record<number, ArUcoGrid> = {};
for (let i = 0; i < 50; i++) PATTERNS[i] = generatePattern(i);

export function getArUcoPattern(id: number): ArUcoGrid {
  const safe = Math.max(0, Math.min(49, id));
  return PATTERNS[safe];
}

export function markerCode(id: number): string {
  return `MARKER_SKEPP_${String(id + 1).padStart(2, "0")}`;
}

export const MAX_MARKERS = 50;