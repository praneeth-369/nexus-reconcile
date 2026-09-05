/**
 * Date & Business Day Utility Module
 * Implements actual business-day calendar logic for settlement analysis.
 */

// Check if a date falls on a weekend (Saturday = 6, Sunday = 0)
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// Calculate actual business days between two dates (excluding Saturdays and Sundays)
export function businessDaysBetween(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return 0;
  }

  let count = 0;
  const current = new Date(start);
  current.setDate(current.getDate() + 1);

  while (current <= end) {
    if (!isWeekend(current)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

// Total calendar days difference
export function calendarDaysBetween(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return -1;
  }

  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check if date difference represents a legitimate weekend settlement delay.
 * Example: Initiated on Friday/Saturday and settled on Monday/Tuesday.
 */
export function isWeekendSettlement(ledgerDateStr: string, bankDateStr: string): {
  isWeekendDelay: boolean;
  ledgerDayName: string;
  bankDayName: string;
  calendarDays: number;
  businessDays: number;
} {
  const lDate = new Date(ledgerDateStr);
  const bDate = new Date(bankDateStr);

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  if (isNaN(lDate.getTime()) || isNaN(bDate.getTime())) {
    return {
      isWeekendDelay: false,
      ledgerDayName: 'Unknown',
      bankDayName: 'Unknown',
      calendarDays: 0,
      businessDays: 0,
    };
  }

  const calDays = calendarDaysBetween(ledgerDateStr, bankDateStr);
  const busDays = businessDaysBetween(ledgerDateStr, bankDateStr);
  const lDay = lDate.getDay();
  const bDay = bDate.getDay();

  // True Weekend Settlement: Initiated Friday (5) or Saturday (6) and settled Monday (1) or Tuesday (2)
  // Calendar days is 1..4, but business days is <= 1.
  const isFriToMon = (lDay === 5 || lDay === 6 || lDay === 0) && (bDay === 1 || bDay === 2) && calDays >= 1 && calDays <= 4 && busDays <= 1;

  return {
    isWeekendDelay: isFriToMon,
    ledgerDayName: daysOfWeek[lDay],
    bankDayName: daysOfWeek[bDay],
    calendarDays: calDays,
    businessDays: busDays,
  };
}

// Add N business days to a given date string
export function addBusinessDays(startDateStr: string, numBusinessDays: number): string {
  const date = new Date(startDateStr);
  if (isNaN(date.getTime())) return startDateStr;

  let added = 0;
  while (added < numBusinessDays) {
    date.setDate(date.getDate() + 1);
    if (!isWeekend(date)) {
      added++;
    }
  }
  return date.toISOString().split('T')[0];
}

// Calculate expected settlement date by payment method
export function getExpectedSettlementDate(ledgerDateStr: string, method: string): string {
  const m = String(method).toUpperCase();
  if (m === 'UPI') {
    return addBusinessDays(ledgerDateStr, 1); // T+1 business day
  } else if (m === 'CREDIT_CARD' || m === 'DEBIT_CARD') {
    return addBusinessDays(ledgerDateStr, 2); // T+2 business days
  } else if (m === 'NET_BANKING') {
    return addBusinessDays(ledgerDateStr, 1); // T+1 business day
  }
  return addBusinessDays(ledgerDateStr, 1);
}
