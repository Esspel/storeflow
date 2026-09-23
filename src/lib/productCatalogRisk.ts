/**
 * Riskberäkning för Produktkatalogens risköversikt.
 *
 * Risknivå = andel av historiska leveranser som har behövt reklameras.
 * Används som sannolikhet att nästa leverans också kommer att kräva ersättning.
 */

export interface RiskInput {
  reclamationCount: number;
  deliveryCount: number;
  uniqueDeliveryDates?: number;
}

export interface RiskResult {
  score: number;
  percentage: number;
  level: "low" | "medium" | "high";
}

/**
 * Beräknar riskpoäng (0–1) utifrån antal reklamationer och totala leveranser.
 * Justerar för kunddatamängd: färre leveranser ger mer konservativ risk.
 * Returnerar alltid 0 vid datafel (negativa värden, NaN, noll leveranser).
 * Använder unika leveransdatum om tillgängligt för mer preciser beräkning.
 */
export function calculateRiskScore(
  reclamationCount: number,
  deliveryCount: number,
  uniqueDeliveryDates?: number,
): number {
  const reclamations = Number(reclamationCount);
  // Använd unika leveransdatum om tillgängligt, annars fall tillbaka på totala rader
  const deliveries = uniqueDeliveryDates != null ? Number(uniqueDeliveryDates) : Number(deliveryCount);

  if (!Number.isFinite(reclamations) || !Number.isFinite(deliveries)) return 0;
  if (reclamations < 0 || deliveries < 0) return 0;
  if (deliveries <= 0) return 0;
  if (reclamations === 0) return 0;

  const ratio = reclamations / deliveries;
  // Confidence factor: requires at least 3 unique delivery dates for full risk weight.
  // Low volume gets a conservative scaling to avoid misleading high risk scores.
  const confidence = Math.min(deliveries / 3, 1);
  return ratio * confidence;
}

export function getRiskLevel(score: number): RiskResult["level"] {
  if (score >= 0.5) return "high";
  if (score >= 0.25) return "medium";
  return "low";
}

export function calculateRisk(input: RiskInput): RiskResult {
  const score = calculateRiskScore(input.reclamationCount, input.deliveryCount, input.uniqueDeliveryDates);
  return {
    score,
    percentage: Math.round(score * 100),
    level: getRiskLevel(score),
  };
}