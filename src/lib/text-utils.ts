// Transliteration map for non-ASCII characters commonly found in Swedish names
const TRANSLITERATE_MAP: Record<string, string> = {
  å: "a", ä: "a", ö: "o",
  Å: "A", Ä: "A", Ö: "O",
  é: "e", è: "e", ê: "e", ë: "e",
  É: "E", È: "E", Ê: "E", Ë: "E",
  á: "a", à: "a", â: "a",
  Á: "A", À: "A", Â: "A",
  í: "i", ì: "i", î: "i", ï: "i",
  Í: "I", Ì: "I", Î: "I", Ï: "I",
  ó: "o", ò: "o", ô: "o", õ: "o",
  Ó: "O", Ò: "O", Ô: "O", Õ: "O",
  ú: "u", ù: "u", û: "u", ü: "u",
  Ú: "U", Ù: "U", Û: "U", Ü: "U",
  ý: "y", ÿ: "y",
  Ý: "Y",
  ñ: "n", Ñ: "N",
  ç: "c", Ç: "C",
  ß: "ss",
  ø: "o", Ø: "O",
  æ: "ae", Æ: "AE",
  þ: "th", Þ: "TH",
  ð: "d", Ð: "D",
};

export function transliterate(str: string): string {
  return str
    .split("")
    .map((ch) => TRANSLITERATE_MAP[ch] ?? ch)
    .join("");
}

// Build a username from display name: "Anna Söderström" → "anna.soderstrom"
export function usernameFromName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  const first = transliterate(parts[0] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const last = transliterate(parts.slice(1).join("")).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!first && !last) return "anvandare";
  if (!last) return first;
  return `${first}.${last}`;
}

const PW_CHARS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%&*-_+=?";

// Generate a cryptographically random password of given length
export function generatePassword(length = 16): string {
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => PW_CHARS[n % PW_CHARS.length]).join("");
}
