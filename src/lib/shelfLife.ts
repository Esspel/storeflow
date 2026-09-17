export function calculateShelfLifeStatus(
  deliveryDate: string,
  bestBeforeDate: string,
  totalShelfLifeDays: number,
): {
  remainingDays: number;
  requiredDays: number;
  status: 'OK' | 'Reklamation';
  percentageLeft: number;
} {
  // Parse dates to UTC timestamps
  const parseDate = (dateStr: string | null | undefined): number | null => {
    if (dateStr == null || dateStr === "—" || dateStr.trim() === "") return null;
    // Handle SAP "Date(ms)" format
    if (dateStr.startsWith('Date(')) {
      const match = dateStr.match(/Date\((\d+)\)/);
      if (!match) return null;
      const timestamp = parseInt(match[1], 10);
      // Validate timestamp range (not negative or unreasonably large)
      if (timestamp < 0 || timestamp > 86400000 * 365 * 100) return null;
      const d = new Date(timestamp);
      if (isNaN(d.getTime())) return null;
      return d.getTime();
    }

    // Handle ISO format
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.getTime();
  };

  const deliveryMs = parseDate(deliveryDate);
  const bestBeforeMs = parseDate(bestBeforeDate);

  // If either date is missing/invalid, treat as Reklamation with zeros
  if (deliveryMs === null || bestBeforeMs === null) {
    return {
      remainingDays: 0,
      requiredDays: totalShelfLifeDays <= 0 ? 0 : totalShelfLifeDays > 548 ? 274 : Math.floor(totalShelfLifeDays * 0.5),
      status: 'Reklamation',
      percentageLeft: 0,
    };
  }

  // Calculate remaining days (UTC-safe)
  const msPerDay = 1000 * 60 * 60 * 24;
  const remainingDays = Math.floor((bestBeforeMs - deliveryMs) / msPerDay);

  // Calculate required days according to 50% rule
  // Artiklar med >18 månader (>548 dagar) kräver 9 månader (274 dagar) kvar
  const requiredDays =
    totalShelfLifeDays <= 0 ? 0 :
    totalShelfLifeDays > 548 ? 274 :
    Math.floor(totalShelfLifeDays * 0.5);

  // Determine status
  // OK when remaining >= required, Reklamation when remaining < required
  const status: 'OK' | 'Reklamation' = remainingDays >= requiredDays ? 'OK' : 'Reklamation';

  // Calculate percentage left
  const percentageLeft = totalShelfLifeDays > 0 ? (remainingDays / totalShelfLifeDays) * 100 : 0;

  return {
    remainingDays,
    requiredDays,
    status,
    percentageLeft: Math.round(percentageLeft * 10) / 10, // 1 decimal place
  };
}