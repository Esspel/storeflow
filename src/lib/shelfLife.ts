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
  const parseDate = (dateStr: string): number => {
    // Handle SAP "Date(ms)" format
    if (dateStr.startsWith('Date(')) {
      const match = dateStr.match(/Date\((\d+)\)/);
      if (match) {
        const timestamp = parseInt(match[1], 10);
        // Validate timestamp range (not negative or unreasonably large)
        if (timestamp < 0 || timestamp > 86400000 * 365 * 100) {
          throw new Error('Invalid SAP timestamp');
        }
        const d = new Date(timestamp);
        if (isNaN(d.getTime())) {
          throw new Error('Invalid date from SAP timestamp');
        }
        return d.getTime();
      }
    }

    // Handle ISO format
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format');
    }
    return date.getTime();
  };

  const deliveryMs = parseDate(deliveryDate);
  const bestBeforeMs = parseDate(bestBeforeDate);

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