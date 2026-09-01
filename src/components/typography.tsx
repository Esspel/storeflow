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

  // Hantera kolon (:) i Coop Sans Price — typsnittet innehåller inte kolon.
  // Vi ersätter med Coop Marker Bold (handgjord stil, passande för priskommunikation)
  // eller låter texten flöda med Coop Sans som fallback.
  const processPriceText = (str: string): React.ReactNode => {
    if (variant !== "price" && variant !== "price-sm" && variant !== "price-lg") return str;
    if (typeof str !== "string") return str;

    const parts = str.split(":");
    if (parts.length <= 1) return str; // inget kolon

    return parts.map((part, i) => (
      <span key={i}>
        <span className={base}>{part}</span>
        {i < parts.length - 1 && (
          <span className="coop-font-marker-strong" aria-label="kolon">:</span>
        )}
      </span>
    ));
  };

  const processed = typeof children === "string" ? processPriceText(children) : children;

  return (
    <span className={`${base} ${alignClass} ${className}`}>{processed}</span>
  );
}
