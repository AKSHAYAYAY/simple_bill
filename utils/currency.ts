/**
 * Indian Rupee currency formatting utilities.
 * Uses Indian numbering system (lakhs, crores).
 */

/**
 * Format a number as Indian Rupee.
 * Examples:
 *   formatINR(1234.5)    → "₹1,234.50"
 *   formatINR(100000)    → "₹1,00,000.00"
 *   formatINR(0)         → "₹0.00"
 *   formatINR(null)      → "₹0.00"
 */
export function formatINR(amount: number | null | undefined, options: { decimals?: number; compact?: boolean } = {}): string {
  const value = Number(amount) || 0;
  const { decimals = 2, compact = false } = options;

  if (compact && value >= 10_000_000) {
    return '₹' + (value / 10_000_000).toFixed(2) + ' Cr';
  }
  if (compact && value >= 100_000) {
    return '₹' + (value / 100_000).toFixed(2) + ' L';
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format as compact Indian number with ₹ symbol.
 * Use for dashboard tiles where space is limited.
 * formatINRCompact(1500000)  → "₹15.00 L"
 * formatINRCompact(25000000) → "₹2.50 Cr"
 */
export function formatINRCompact(amount: number | null | undefined): string {
  return formatINR(amount, { compact: true });
}

/**
 * Format due balance amount.
 * Negative due values represent advance paid by the party.
 * formatDueAmount(-1500) -> "₹1,500.00 (Advance Paid)"
 * formatDueAmount(2500)  -> "₹2,500.00"
 */
export function formatDueAmount(amount: number | null | undefined, options: { decimals?: number } = {}): string {
  const value = Number(amount) || 0;
  if (value < 0) {
    return formatINR(Math.abs(value), options) + ' (Advance Paid)';
  }
  return formatINR(value, options);
}

