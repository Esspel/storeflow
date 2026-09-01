import { supabaseUrl } from "./supabase";

/**
 * Coop Typsnitt - Bibliotek för typsnittshantering
 *
 * Användning:
 * 1. Anropa initializeFonts() vid app-start
 * 2. Använd CSS-klasserna i styles.css för att applicera typsnitt
 *
 * Typsnittsregler enligt Coop:s manual:
 * - Coop Sans Black (900): Stora rubriker
 * - Coop Sans Bold (700): Mellanstora/små rubriker
 * - Coop Sans Medium (500): Ingresser & betoning
 * - Coop Sans Regular (400): Brödtext
 * - Coop Sans Price Black (900): Prissättning
 * - Coop Marker Regular (400): Handgjord känsla, komplement
 * - Coop Marker Bold (700): Stark betoning i handgjord stil
 */

/**
 * Initierar typsnitts-URL:er genom att injicera @font-face-reglerna
 * i dokumentet. Detta måste ske efter att DOM:en är redo.
 *
 * Detta gör att @font-face src: url() inte behöver lösas vid build-tid,
 * utan löses i stället av webbläsaren när styles injiceras dynamiskt.
 */
export function initializeFonts(): void {
  if (typeof window === "undefined" || !document?.documentElement) return;

  const fontBaseUrl = `${supabaseUrl}/storage/v1/object/public/fonts`;

  // @font-face-regler injiceras dynamiskt för att undvika
  // build-time var() resolution av CSS-variabler
  const fontFaces = [
    {
      family: "Coop Sans",
      weights: [
        { weight: 900, filename: "CoopSans-Black.woff2" },
        { weight: 700, filename: "CoopSans-Bold.woff2" },
        { weight: 500, filename: "CoopSans-Medium.woff2" },
        { weight: 400, filename: "CoopSans-Regular.woff2" },
      ],
    },
    {
      family: "Coop Sans Price",
      weights: [
        { weight: 900, filename: "CoopSansPrice-Black.woff2" },
      ],
    },
    {
      family: "Coop Marker",
      weights: [
        { weight: 700, filename: "CoopMarker-Bold.woff2" },
        { weight: 400, filename: "CoopMarker-Regular.woff2" },
      ],
    },
  ];

  let css = "";

  // Coop Sans med alla vikter
  css += `@font-face {
    font-family: 'Coop Sans';
    src: url('${fontBaseUrl}/CoopSans-Black.woff2') format('woff2');
    font-weight: 900;
    font-style: normal;
    font-display: block;
  }`;
  css += `@font-face {
    font-family: 'Coop Sans';
    src: url('${fontBaseUrl}/CoopSans-Bold.woff2') format('woff2');
    font-weight: 700;
    font-style: normal;
    font-display: swap;
  }`;
  css += `@font-face {
    font-family: 'Coop Sans';
    src: url('${fontBaseUrl}/CoopSans-Medium.woff2') format('woff2');
    font-weight: 500;
    font-style: normal;
    font-display: swap;
  }`;
  css += `@font-face {
    font-family: 'Coop Sans';
    src: url('${fontBaseUrl}/CoopSans-Regular.woff2') format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }`;

  // Coop Sans Price
  css += `@font-face {
    font-family: 'Coop Sans Price';
    src: url('${fontBaseUrl}/CoopSansPrice-Black.woff2') format('woff2');
    font-weight: 900;
    font-style: normal;
    font-display: swap;
  }`;

  // Coop Marker
  css += `@font-face {
    font-family: 'Coop Marker';
    src: url('${fontBaseUrl}/CoopMarker-Bold.woff2') format('woff2');
    font-weight: 700;
    font-style: normal;
    font-display: swap;
  }`;
  css += `@font-face {
    font-family: 'Coop Marker';
    src: url('${fontBaseUrl}/CoopMarker-Regular.woff2') format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }`;

  const styleEl = document.createElement("style");
  styleEl.type = "text/css";
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}

/**
 * Hämtar fullständig URL för en specifik typsnittsfil.
 * Användbar för dynamisk laddning eller debugging.
 */
export function getFontUrl(filename: string): string {
  return `${supabaseUrl}/storage/v1/object/public/fonts/${filename}`;
}

/**
 * Typografiska varianter enligt Coop:s manual
 */
export type TypographyVariant =
  | "display" // Stora rubriker - Coop Sans Black
  | "heading" // Mellanstora rubriker - Coop Sans Bold
  | "heading-sm" // Små rubriker - Coop Sans Bold
  | "emphasis" // Ingresser & betoning - Coop Sans Medium
  | "body" // Brödtext - Coop Sans Regular
  | "price" // Prissättning - Coop Sans Price Black
  | "price-sm" // Mindre priser
  | "price-lg" // Stora priser/erbjudanden
  | "marker" // Handgjord känsla - Coop Marker Regular
  | "marker-strong"; // Stark betoning - Coop Marker Bold

/**
 * CSS-klasser för typografiska varianter
 */
export const typographyClass: Record<TypographyVariant, string> = {
  display: "coop-font-display",
  heading: "coop-font-heading",
  "heading-sm": "coop-font-heading-sm",
  emphasis: "coop-font-emphasis",
  body: "coop-font-body",
  price: "coop-font-price",
  "price-sm": "coop-font-price-sm",
  "price-lg": "coop-font-price-lg",
  marker: "coop-font-marker",
  "marker-strong": "coop-font-marker-strong",
};

/**
 * Hämtar CSS-klassen för en typografisk variant
 */
export function getTypographyClass(variant: TypographyVariant): string {
  return typographyClass[variant];
}