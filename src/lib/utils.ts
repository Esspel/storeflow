import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function ensureHttps(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Parse a free-form time string into HH:MM format.
 * Accepts: "1152" → "11:52", "8:5" → "08:05", "930" → "09:30", "14:00" → "14:00".
 * Returns null for invalid input (>4 raw digits or out-of-range hours/minutes).
 */
export function parseTimeInput(raw: string): { value: string; error: string | null } {
  const digits = raw.replace(/\D/g, "");
  if (digits.length > 4) return { value: raw, error: "Ogiltigt klockslag angivet." };
  if (!digits) return { value: "", error: null };

  let hours: number;
  let minutes: number;

  if (digits.length <= 2) {
    hours = parseInt(digits, 10);
    minutes = 0;
  } else {
    hours = parseInt(digits.slice(0, digits.length - 2), 10);
    minutes = parseInt(digits.slice(-2), 10);
  }

  if (hours > 23 || hours < 0) return { value: raw, error: "Ogiltigt klockslag angivet." };
  if (minutes > 59 || minutes < 0) return { value: raw, error: "Ogiltigt klockslag angivet." };

  const formatted = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return { value: formatted, error: null };
}

/**
 * Sanitize a CSV cell value to prevent formula/macro injection.
 * Prepends a single quote if the value starts with =, +, -, or @ so
 * spreadsheet applications treat it as literal text.
 */
export function sanitizeCsvCell(value: string): string {
  if (/^[=+\-@]/.test(value)) return `'${value}`;
  return value;
}
