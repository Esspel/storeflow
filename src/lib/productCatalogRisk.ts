/**
 * Riskberäkning för Produktkatalogens risköversikt.
 *
 * Risknivå = andel av historiska leveranser som har behövt reklameras.
 * Används som sannolikhet att nästa leverans också kommer att kräva ersättning.
 */

export interface RiskInput {
  reclamationCount: number;
  deliveryCount: number;
}

export interface RiskResult {
  score: number;
  percentage: number;
  level: "low" | "medium" | "high";
}

/**
 * Beräknar riskpoäng (0–1) utifrån antal reklamationer och totala leveranser.
 * Returnerar alltid 0 vid datafel (negativa värden, NaN, noll leveranser).
 */
export function calculateRiskScore(
  reclamationCount: number,
  deliveryCount: number,
): number {
  const reclamations = Number(reclamationCount);
  const deliveries = Number(deliveryCount);

  if (!Number.isFinite(reclamations) || !Number.isFinite(deliveries)) return 0;
  if (reclamations < 0 || deliveries < 0) return 0;
  if (deliveries <= 0) return 0;
  if (reclamations === 0) return 0;

  return reclamations / deliveries;
}

export function getRiskLevel(score: number): RiskResult["level"] {
  if (score >= 0.5) return "high";
  if (score >= 0.25) return "medium";
  return "low";
}

export function calculateRisk(input: RiskInput): RiskResult {
  const score = calculateRiskScore(input.reclamationCount, input.deliveryCount);
  return {
    score,
    percentage: Math.round(score * 100),
    level: getRiskLevel(score),
  };
}