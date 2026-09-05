/**
 * Finance Utility Module
 * All monetary calculations use integer minor units (paise) to prevent IEEE 754 floating-point errors.
 */

// Convert INR rupees to integer paise (₹100.50 -> 10050 paise)
export function toPaise(rupees: number): number {
  if (isNaN(rupees)) return 0;
  return Math.round(rupees * 100);
}

// Convert integer paise to INR rupees (10050 paise -> ₹100.50)
export function toRupees(paise: number): number {
  if (isNaN(paise)) return 0;
  return paise / 100;
}

// Calculate MDR fee in paise given gross amount in paise and fee rate (e.g. 0.02 for 2%)
export function calculateMdrFeePaise(grossPaise: number, feeRate: number = 0.02): number {
  return Math.round(grossPaise * feeRate);
}

// Calculate GST in paise on MDR fee (18% GST on MDR fee)
export function calculateGstPaise(mdrFeePaise: number, gstRate: number = 0.18): number {
  return Math.round(mdrFeePaise * gstRate);
}

// Format paise to INR currency string (e.g. ₹1,500.00)
export function formatPaiseToINR(paise: number, includeDecimals: boolean = true): string {
  const rupees = toRupees(paise);
  return rupees.toLocaleString('en-IN', {
    minimumFractionDigits: includeDecimals ? 2 : 0,
    maximumFractionDigits: includeDecimals ? 2 : 0,
  });
}

// Format rupees to INR currency string (e.g. ₹1,500.00)
export function formatRupeesToINR(rupees: number, includeDecimals: boolean = true): string {
  if (isNaN(rupees)) return '₹0.00';
  return rupees.toLocaleString('en-IN', {
    minimumFractionDigits: includeDecimals ? 2 : 0,
    maximumFractionDigits: includeDecimals ? 2 : 0,
  });
}

// Calculate estimated manual review effort avoided in hours (e.g. ~1.9 hrs avoided @ 2 min/review assumption)
export function calculateEffortAvoidedHours(
  resolvedCount: number,
  minutesPerReviewAssumption: number = 2
): { hours: number; formattedText: string; assumptionNote: string } {
  const totalMinutes = resolvedCount * minutesPerReviewAssumption;
  const hours = Math.round((totalMinutes / 60) * 10) / 10;
  return {
    hours,
    formattedText: `~${hours} hrs avoided`,
    assumptionNote: `Based on standard assumption of ${minutesPerReviewAssumption} mins saved per auto-reconciled payment.`,
  };
}

// Calculate resolution percentage rounded to 1 decimal place
export function calculateResolutionRatePct(resolvedCount: number, totalCount: number): number {
  if (totalCount <= 0) return 0;
  return Math.round((resolvedCount / totalCount) * 1000) / 10;
}
