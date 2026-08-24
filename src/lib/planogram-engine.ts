/**
 * Planogram Compliance Engine
 * Compares observed shelf state with expected planogram
 * Calculates compliance score, missing products, misplaced products, etc.
 */

import type {
  ShelfPlanogram,
  ShelfObservation,
  ExpectedProduct,
  ObservedProduct,
  MisplacedProduct,
  Vector3,
} from "@/lib/posemesh/types";

export interface PlanogramCheckResult {
  complianceScore: number; // 0-100
  missingProducts: MissingProduct[];
  misplacedProducts: MisplacedProductDetail[];
  extraProducts: ExtraProduct[];
  summary: ComplianceSummary;
}

export interface MissingProduct {
  product_id: string;
  ean: string;
  name: string;
  expected_position: Vector3;
  expected_facings: number;
  expected_quantity: number;
}

export interface MisplacedProductDetail {
  product_id: string;
  ean: string;
  name: string;
  expected_position: Vector3;
  actual_position: Vector3;
  distance_meters: number;
  expected_facings: number;
  actual_facings: number;
}

export interface ExtraProduct {
  product_id: string;
  ean: string;
  name: string;
  actual_position: Vector3;
  detected_facings: number;
  confidence: number;
}

export interface ComplianceSummary {
  total_expected: number;
  total_observed: number;
  correct_position: number;
  missing_count: number;
  misplaced_count: number;
  extra_count: number;
  compliance_percentage: number;
}

/**
 * Default matching thresholds
 */
const DEFAULT_POSITION_TOLERANCE_METERS = 0.15; // 15cm
const DEFAULT_FACING_TOLERANCE = 1; // Allow ±1 facing difference
const CONFIDENCE_THRESHOLD = 0.5; // Minimum detection confidence

/**
 * Check planogram compliance
 */
export function checkPlanogramCompliance(
  planogram: ShelfPlanogram,
  observation: ShelfObservation,
  options: {
    positionToleranceMeters?: number;
    facingTolerance?: number;
    confidenceThreshold?: number;
  } = {},
): PlanogramCheckResult {
  const {
    positionToleranceMeters = DEFAULT_POSITION_TOLERANCE_METERS,
    facingTolerance = DEFAULT_FACING_TOLERANCE,
    confidenceThreshold = CONFIDENCE_THRESHOLD,
  } = options;

  const expectedProducts = planogram.expected_products || [];
  const observedProducts = observation.observed_products || [];

  // Convert expected product positions to Vector3
  const expectedWithVector3 = expectedProducts.map((ep) => ({
    ...ep,
    position: shelfPositionToVector3(ep.position),
  }));

  // Filter out low-confidence observations
  const validObservations = observedProducts.filter(
    (o) => (o.confidence ?? 1) >= confidenceThreshold,
  );

  // Track matches
  const matchedExpected = new Set<string>();
  const matchedObserved = new Set<string>();

  const missingProducts: MissingProduct[] = [];
  const misplacedProducts: MisplacedProductDetail[] = [];
  const extraProducts: ExtraProduct[] = [];
  let correctPosition = 0;

  // For each expected product, find best matching observation
  for (const expected of expectedWithVector3) {
    let bestMatch: { observed: ObservedProduct; distance: number } | null = null;

    for (const observed of validObservations) {
      if (matchedObserved.has(observed.product_id)) continue;

      // Match by product_id or EAN
      const isMatch = observed.product_id === expected.product_id || observed.ean === expected.ean;

      if (!isMatch) continue;

      const distance = calculateDistance(expected.position, observed.position);

      if (distance <= positionToleranceMeters) {
        if (!bestMatch || distance < bestMatch.distance) {
          bestMatch = { observed, distance };
        }
      }
    }

    if (bestMatch) {
      // Found a match within tolerance
      matchedExpected.add(expected.product_id);
      matchedObserved.add(bestMatch.observed.product_id);

      // Check facing count
      const facingDiff = Math.abs(bestMatch.observed.facing_count ?? 0 - expected.facings);

      if (facingDiff <= facingTolerance) {
        correctPosition++;
      } else {
        // Correct position but wrong facing count
        misplacedProducts.push({
          product_id: expected.product_id,
          ean: expected.ean,
          name: expected.name,
          expected_position: expected.position,
          actual_position: bestMatch.observed.position,
          distance_meters: bestMatch.distance,
          expected_facings: expected.facings,
          actual_facings: bestMatch.observed.facing_count ?? 0,
        });
      }
    } else {
      // No match found - product is missing
      missingProducts.push({
        product_id: expected.product_id,
        ean: expected.ean,
        name: expected.name,
        expected_position: expected.position,
        expected_facings: expected.facings,
        expected_quantity: expected.total_quantity,
      });
    }
  }

  // Find extra products (observed but not in planogram)
  for (const observed of validObservations) {
    if (matchedObserved.has(observed.product_id)) continue;

    // Check if it matches any expected by EAN but was not matched due to position
    const expectedMatch = expectedWithVector3.find(
      (e) => e.ean === observed.ean && !matchedExpected.has(e.product_id),
    );

    if (expectedMatch) {
      // This is a misplaced product (wrong position)
      const distance = calculateDistance(expectedMatch.position, observed.position);

      misplacedProducts.push({
        product_id: expectedMatch.product_id,
        ean: observed.ean,
        name: expectedMatch.name,
        expected_position: expectedMatch.position,
        actual_position: observed.position,
        distance_meters: distance,
        expected_facings: expectedMatch.facings,
        actual_facings: observed.facing_count ?? 0,
      });
      matchedExpected.add(expectedMatch.product_id);
    } else {
      // Truly extra product
      extraProducts.push({
        product_id: observed.product_id,
        ean: observed.ean,
        name: observed.name || "Okänd produkt",
        actual_position: observed.position,
        detected_facings: observed.facing_count ?? 0,
        confidence: observed.confidence ?? 1,
      });
    }
  }

  // Calculate compliance score
  const totalExpected = expectedProducts.length;
  const totalObserved = validObservations.length;

  // Weighted score: correct position counts most, then facing accuracy
  const positionWeight = 0.7;
  const facingWeight = 0.3;

  const positionScore = totalExpected > 0 ? (correctPosition / totalExpected) * 100 : 100;
  const facingScore =
    totalExpected > 0 ? (1 - misplacedProducts.length / totalExpected) * 100 : 100;

  const complianceScore = Math.round(positionWeight * positionScore + facingWeight * facingScore);

  return {
    complianceScore: Math.max(0, Math.min(100, complianceScore)),
    missingProducts,
    misplacedProducts,
    extraProducts,
    summary: {
      total_expected: totalExpected,
      total_observed: totalObserved,
      correct_position: correctPosition,
      missing_count: missingProducts.length,
      misplaced_count: misplacedProducts.length,
      extra_count: extraProducts.length,
      compliance_percentage: Math.max(0, Math.min(100, complianceScore)),
    },
  };
}

/**
 * Convert shelf position (planogram format) to Vector3
 */
function shelfPositionToVector3(pos: ExpectedProduct["position"]): Vector3 {
  return {
    x: pos.x_offset_inch * 0.0254, // inches to meters
    y: pos.y_offset_inch * 0.0254,
    z: pos.z_offset_inch * 0.0254,
  };
}

/**
 * Create a shelf observation from raw detection data
 */
export function createShelfObservation(
  planogramId: string,
  storeId: string,
  detectedProducts: Array<{
    product_id: string;
    ean: string;
    name: string;
    position: Vector3;
    confidence: number;
    marker_id: string;
    facing_count?: number;
  }>,
  capturedBy: string,
  captureMethod: "camera" | "manual" | "hybrid" = "camera",
): Omit<ShelfObservation, "id" | "created_at"> {
  // Get planogram to compare
  // Note: In real usage, fetch planogram from database
  // This is a factory function - compliance check happens separately

  return {
    store_id: storeId,
    planogram_id: planogramId,
    observed_products: detectedProducts,
    compliance_score: 0, // Will be calculated
    missing_products: [],
    misplaced_products: [],
    extra_products: [],
    captured_by: capturedBy,
    capture_method: captureMethod,
    device_info: {
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      timestamp: new Date().toISOString(),
    },
    captured_at: new Date().toISOString(),
  };
}

/**
 * Calculate 3D distance between two positions
 */
function calculateDistance(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Generate human-readable compliance report
 */
export function generateComplianceReport(result: PlanogramCheckResult): string {
  const { summary, missingProducts, misplacedProducts, extraProducts } = result;

  let report = `📊 Planogram Compliance Report\n`;
  report += `Score: ${summary.compliance_percentage}%\n\n`;

  report += `📈 Summary:\n`;
  report += `  Expected products: ${summary.total_expected}\n`;
  report += `  Observed products: ${summary.total_observed}\n`;
  report += `  ✅ Correct: ${summary.correct_position}\n`;
  report += `  ❌ Missing: ${summary.missing_count}\n`;
  report += `  📍 Misplaced: ${summary.misplaced_count}\n`;
  report += `  ➕ Extra: ${summary.extra_count}\n\n`;

  if (missingProducts.length > 0) {
    report += `❌ Missing Products:\n`;
    for (const p of missingProducts) {
      report += `  - ${p.name} (EAN: ${p.ean}) - Expected at shelf ${p.expected_position.y.toFixed(1)}m\n`;
    }
    report += "\n";
  }

  if (misplacedProducts.length > 0) {
    report += `📍 Misplaced Products:\n`;
    for (const p of misplacedProducts) {
      report += `  - ${p.name} (EAN: ${p.ean}) - ${p.distance_meters.toFixed(2)}m off (${p.expected_facings}→${p.actual_facings} facings)\n`;
    }
    report += "\n";
  }

  if (extraProducts.length > 0) {
    report += `➕ Extra Products (not in planogram):\n`;
    for (const p of extraProducts) {
      report += `  - ${p.name} (EAN: ${p.ean}) - Confidence: ${(p.confidence * 100).toFixed(0)}%\n`;
    }
    report += "\n";
  }

  return report;
}

/**
 * Auto-create incidents/deviations from compliance results
 */
export interface ComplianceIncident {
  type: "missing_product" | "misplaced_product" | "extra_product";
  severity: "low" | "medium" | "high";
  product_id: string;
  product_name: string;
  ean: string;
  description: string;
  location: Vector3;
  expected_location?: Vector3;
  metadata: Record<string, unknown>;
}

export function createIncidentsFromCompliance(
  result: PlanogramCheckResult,
  storeId: string,
): ComplianceIncident[] {
  const incidents: ComplianceIncident[] = [];

  // Missing products - high severity
  for (const p of result.missingProducts) {
    incidents.push({
      type: "missing_product",
      severity: "high",
      product_id: p.product_id,
      product_name: p.name,
      ean: p.ean,
      description: `Produkt "${p.name}" (${p.ean}) saknas på hylla. Förväntade ${p.expected_facings} ansikten.`,
      location: p.expected_position,
      expected_location: p.expected_position,
      metadata: {
        expected_facings: p.expected_facings,
        expected_quantity: p.expected_quantity,
      },
    });
  }

  // Misplaced products - medium severity
  for (const p of result.misplacedProducts) {
    const severity = p.distance_meters > 0.5 ? "high" : "medium";
    incidents.push({
      type: "misplaced_product",
      severity,
      product_id: p.product_id,
      product_name: p.name,
      ean: p.ean,
      description: `Produkt "${p.name}" (${p.ean}) placerad fel. ${p.distance_meters.toFixed(2)}m från förväntad position.`,
      location: p.actual_position,
      expected_location: p.expected_position,
      metadata: {
        distance_meters: p.distance_meters,
        expected_facings: p.expected_facings,
        actual_facings: p.actual_facings,
      },
    });
  }

  // Extra products - low severity
  for (const p of result.extraProducts) {
    incidents.push({
      type: "extra_product",
      severity: "low",
      product_id: p.product_id,
      product_name: p.name,
      ean: p.ean,
      description: `Extra produkt "${p.name}" (${p.ean}) hittades som inte finns i planogram.`,
      location: p.actual_position,
      metadata: {
        detected_facings: p.detected_facings,
        confidence: p.confidence,
      },
    });
  }

  return incidents;
}
