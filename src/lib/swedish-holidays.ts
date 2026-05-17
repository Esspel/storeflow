// Swedish public holidays (röda dagar) computed for any year.
// Does not require external packages — all logic is self-contained.

export type SwedishHoliday = {
  date: Date;
  name: string;
  isWeekday: boolean; // true if the holiday falls Mon-Sat (a "weekday red day")
};

function easterSunday(year: number): Date {
  // Gauss's algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Midsommarafton = Friday between June 19-25
function midsummerEve(year: number): Date {
  const d = new Date(year, 5, 19);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  return d;
}

// Alla helgons dag = Saturday between Oct 31 - Nov 6
function allSaintsDay(year: number): Date {
  const d = new Date(year, 9, 31);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  return d;
}

export function getSwedishHolidays(year: number): SwedishHoliday[] {
  const easter = easterSunday(year);
  const mid = midsummerEve(year);
  const allSaints = allSaintsDay(year);

  const fixed: Array<[Date, string]> = [
    [new Date(year, 0, 1), "Nyårsdagen"],
    [new Date(year, 0, 6), "Trettondedag jul"],
    [new Date(year, 4, 1), "Första maj"],
    [new Date(year, 5, 6), "Sveriges nationaldag"],
    [new Date(year, 11, 24), "Julafton"],
    [new Date(year, 11, 25), "Juldagen"],
    [new Date(year, 11, 26), "Annandag jul"],
    [new Date(year, 11, 31), "Nyårsafton"],
  ];

  const movable: Array<[Date, string]> = [
    [addDays(easter, -3), "Skärtorsdagen"],
    [addDays(easter, -2), "Långfredagen"],
    [addDays(easter, -1), "Påskafton"],
    [easter, "Påskdagen"],
    [addDays(easter, 1), "Annandag påsk"],
    [addDays(easter, 39), "Kristi himmelsfärdsdag"],
    [addDays(easter, 49), "Pingstdagen"],
    [mid, "Midsommarafton"],
    [addDays(mid, 1), "Midsommardagen"],
    [allSaints, "Alla helgons dag"],
  ];

  return [...fixed, ...movable].map(([date, name]) => {
    const dow = date.getDay(); // 0=Sun, 6=Sat
    return { date, name, isWeekday: dow !== 0 };
  });
}

// Get ISO week number (Mon=start) for a given date
export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Check if a calendar week (year + weekNumber) contains any Swedish holiday
// Returns the first matching holiday name, or null
export function getSpecialWeekHoliday(year: number, weekNumber: number): string | null {
  const holidays = getSwedishHolidays(year);
  for (const h of holidays) {
    const wy = h.date.getFullYear();
    const wn = isoWeekNumber(h.date);
    // Account for holidays in week 1 of the following year
    if ((wy === year || wy === year - 1 || wy === year + 1) && wn === weekNumber) {
      return h.name;
    }
  }
  return null;
}

// Parse a Stockholm-local datetime string to UTC ISO string.
// Input: "2024-03-31T01:30" (Swedish local time, may be ambiguous during DST)
// Output: "2024-03-31T00:30:00.000Z" (UTC)
export function stockholmToUtc(localDateTimeStr: string): string {
  // Use Intl to determine UTC offset for the given local time in Stockholm
  const [datePart, timePart] = localDateTimeStr.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = (timePart ?? "00:00").split(":").map(Number);

  // Create a Date by interpreting the input as UTC, then adjust
  const naiveUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Find the UTC offset for this moment in Stockholm
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });

  // Binary-search the offset (Stockholm is UTC+1 or UTC+2)
  for (const offsetHours of [2, 1]) {
    const candidate = new Date(naiveUtc.getTime() - offsetHours * 3600000);
    const parts = Object.fromEntries(
      formatter.formatToParts(candidate).map((p) => [p.type, p.value])
    );
    const candidateLocal = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
    // Compare with zero-padded input
    const inputNorm = `${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
    if (candidateLocal === inputNorm) return candidate.toISOString();
  }

  // Fallback: treat as UTC
  return naiveUtc.toISOString();
}

// Format a UTC ISO string for display in Stockholm timezone
export function utcToStockholm(utcIsoString: string): Date {
  return new Date(utcIsoString);
}

export function formatStockholmTime(utcIsoString: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(utcIsoString).toLocaleString("sv-SE", {
    timeZone: "Europe/Stockholm",
    ...opts,
  });
}
