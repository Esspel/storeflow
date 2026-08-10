// Swedish public holidays (röda dagar) & eves computed for any year.
// Does not require external packages — all logic is self-contained.

export type SwedishHoliday = {
  date: Date;
  name: string;
  isRedDay: boolean; // Strictly legal "röd dag" (Lag 1989:253)
  isEve: boolean;    // Festive eves (Julafton, Midsommarafton, etc.)
  isWeekday: boolean; // True if falling Mon–Sat
};

function easterSunday(year: number): Date {
  // Meeus/Jones/Butcher Gregorian Easter algorithm
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
  const midEve = midsummerEve(year);
  const allSaints = allSaintsDay(year);

  // [Date, Name, isRedDay, isEve]
  const list: Array<[Date, string, boolean, boolean]> = [
    // Fasta datum
    [new Date(year, 0, 1), "Nyårsdagen", true, false],
    [new Date(year, 0, 6), "Trettondedag jul", true, false],
    [new Date(year, 4, 1), "Första maj", true, false],
    [new Date(year, 5, 6), "Sveriges nationaldag", true, false],
    [new Date(year, 11, 24), "Julafton", false, true],
    [new Date(year, 11, 25), "Juldagen", true, false],
    [new Date(year, 11, 26), "Annandag jul", true, false],
    [new Date(year, 11, 31), "Nyårsafton", false, true],

    // Rörliga datum baserade på påsk
    [addDays(easter, -3), "Skärtorsdagen", false, false],
    [addDays(easter, -2), "Långfredagen", true, false],
    [addDays(easter, -1), "Påskafton", false, true],
    [easter, "Påskdagen", true, false],
    [addDays(easter, 1), "Annandag påsk", true, false],
    [addDays(easter, 39), "Kristi himmelsfärdsdag", true, false],
    [addDays(easter, 49), "Pingstdagen", true, false],

    // Övriga rörliga
    [midEve, "Midsommarafton", false, true],
    [addDays(midEve, 1), "Midsommardagen", true, false],
    [allSaints, "Alla helgons dag", true, false],
  ];

  return list.map(([date, name, isRedDay, isEve]) => {
    const dow = date.getDay(); // 0=Sun, 6=Sat
    return {
      date,
      name,
      isRedDay,
      isEve,
      isWeekday: dow !== 0,
    };
  });
}

/**
 * Calculates ISO 8601 week number and ISO week-numbering year.
 */
export function getIsoWeekDetails(date: Date): { isoYear: number; isoWeek: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { isoYear, isoWeek };
}

export function isoWeekNumber(date: Date): number {
  return getIsoWeekDetails(date).isoWeek;
}

/**
 * Check if a calendar week (isoYear + weekNumber) contains any Swedish holiday.
 * Scans adjacent years to ensure boundary-crossing weeks (Week 1 / Week 52/53) match accurately.
 */
export function getSpecialWeekHoliday(targetIsoYear: number, targetWeekNumber: number): string | null {
  const yearsToScan = [targetIsoYear - 1, targetIsoYear, targetIsoYear + 1];

  for (const y of yearsToScan) {
    const holidays = getSwedishHolidays(y);
    for (const h of holidays) {
      const { isoYear, isoWeek } = getIsoWeekDetails(h.date);
      if (isoYear === targetIsoYear && isoWeek === targetWeekNumber) {
        return h.name;
      }
    }
  }
  return null;
}

/**
 * Parse a Stockholm-local datetime string to UTC ISO string.
 * Input format: "YYYY-MM-DDTHH:mm"
 */
export function stockholmToUtc(localDateTimeStr: string): string {
  const [datePart, timePart] = localDateTimeStr.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = (timePart ?? "00:00").split(":").map(Number);

  const naiveUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));

  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // Try daylight saving offset (UTC+2) first, then normal time (UTC+1)
  for (const offsetHours of [2, 1]) {
    const candidate = new Date(naiveUtc.getTime() - offsetHours * 3600000);
    const parts = Object.fromEntries(
      formatter.formatToParts(candidate).map((p) => [p.type, p.value])
    );

    const candidateLocal = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
    const inputNorm = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

    if (candidateLocal === inputNorm) {
      return candidate.toISOString();
    }
  }

  return naiveUtc.toISOString();
}

export function formatStockholmTime(
  utcIsoString: string,
  opts?: Intl.DateTimeFormatOptions
): string {
  return new Date(utcIsoString).toLocaleString("sv-SE", {
    timeZone: "Europe/Stockholm",
    ...opts,
  });
}
