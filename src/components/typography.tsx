import { type TypographyVariant, getTypographyClass } from "@/lib/fonts";

interface TypographyProps {
  variant?: TypographyVariant;
  children: React.ReactNode;
  className?: string;
  centered?: boolean;
  asymmetric?: boolean;
}

/**
 * Typography-komponent enligt Coop:s manual
 *
 * Regler:
 * - display (Black, 900): Stora rubriker
 * - heading (Bold, 700): Mellanstora/små rubriker
 * - emphasis (Medium, 500): Ingresser & betoning
 * - body (Regular, 400): Brödtext
 * - price (Price Black, 900): Prissättning
 * - marker (Marker Regular, 400): Handgjord komplement
 *
 * Justering:
 * - Standard: vänsterställd eller centrerad (via centered-prop)
 * - Asymmetriska layouter: frångå standard (via asymmetric-prop)
 */
export function Typography({
  variant = "body",
  children,
  className = "",
  centered = false,
  asymmetric = false,
}: TypographyProps) {
  const base = getTypographyClass(variant);
  const alignClass = asymmetric
    ? "text-asymmetric"
    : centered
      ? "text-center"
      : "text-left";

  return (
    <span className={`${base} ${alignClass} ${className}`}>{children}</span>
  );
}
