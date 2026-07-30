import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Ensures a URL string starts with https://.
 * If forceHttps is true, it upgrades http:// to https://.
 */
export function ensureHttps(value: string, forceHttps = false): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  if (forceHttps && /^http:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, "https://");
  }

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Parse a free-form time string into HH:MM format.
 * Accepts: "1152" → "11:52", "8:5" → "08:05", "930" → "09:30", "14:00" → "14:00".
 * Returns null for invalid input (>4 raw digits or out-of-range hours/minutes).
 */
export function parseTimeInput(raw: string): { value: string; error: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: "", error: null };

  let hours: number;
  let minutes: number;

  // Om strängen innehåller ett skiljetecken (t.ex. "8:5" eller "14.30")
  if (trimmed.includes(":") || trimmed.includes(".")) {
    const parts = trimmed.split(/[:.]/);
    if (parts.length !== 2) {
      return { value: raw, error: "Ogiltigt klockslag angivet." };
    }

    const hDigits = parts[0].replace(/\D/g, "");
    const mDigits = parts[1].replace(/\D/g, "");

    if (!hDigits || !mDigits) {
      return { value: raw, error: "Ogiltigt klockslag angivet." };
    }

    hours = parseInt(hDigits, 10);
    minutes = parseInt(mDigits, 10);
  } else {
    // Om strängen enbart består av siffror (t.ex. "1152", "930", "9")
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length > 4 || digits.length === 0) {
      return { value: raw, error: "Ogiltigt klockslag angivet." };
    }

    if (digits.length <= 2) {
      hours = parseInt(digits, 10);
      minutes = 0;
    } else {
      hours = parseInt(digits.slice(0, digits.length - 2), 10);
      minutes = parseInt(digits.slice(-2), 10);
    }
  }

  if (isNaN(hours) || isNaN(minutes) || hours > 23 || hours < 0 || minutes > 59 || minutes < 0) {
    return { value: raw, error: "Ogiltigt klockslag angivet." };
  }

  const formatted = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return { value: formatted, error: null };
}

/**
 * Sanitize a CSV cell value to prevent formula/macro injection.
 * Prepends a single quote if the value starts with =, +, -, @, \t, or \r
 * so spreadsheet applications treat it as literal text.
 */
export function sanitizeCsvCell(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}
