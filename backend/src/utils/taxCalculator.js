/**
 * Utility functions for calculating taxes and rounding.
 */

export function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Calculates the base price and tax amount for an item based on business tax settings.
 * 
 * @param {Object} item - The product/item object containing selling_price and tax percentages
 * @param {string} taxMode - The default tax mode for the sale (e.g., 'CGST+SGST', 'IGST', 'No Tax')
 * @param {string} taxDisplayMode - The tax display mode ('Tax Inclusive' or 'Tax Exclusive')
 * @returns {Object} - { base, tax }
 */
export function calculateItemTax(item, taxMode, taxDisplayMode) {
  if (taxMode === 'No Tax') {
    return { base: item.selling_price, tax: 0 };
  }

  const rate = (taxMode === 'IGST') 
    ? (item.igst_percentage || 0) 
    : ((item.cgst_percentage || 0) + (item.sgst_percentage || 0));
  
  if (taxDisplayMode === 'Tax Inclusive') {
    // Price already includes GST — extract it
    const basePrice = item.selling_price / (1 + rate / 100);
    const taxAmount = item.selling_price - basePrice;
    return { base: round2(basePrice), tax: round2(taxAmount) };
  } else {
    // Tax Exclusive — add tax on top
    const taxAmount = item.selling_price * rate / 100;
    return { base: item.selling_price, tax: round2(taxAmount) };
  }
}

/**
 * Applies rounding off to a total amount if enabled in settings.
 * 
 * @param {number} rawTotal - The unrounded total amount
 * @param {boolean} enabled - Whether rounding is enabled
 * @returns {Object} - { round_off, grand_total }
 */
export function applyRoundOff(rawTotal, enabled) {
  if (!enabled) {
    return { round_off: 0, grand_total: round2(rawTotal) };
  }
  const rounded = Math.round(rawTotal);
  return { round_off: round2(rounded - rawTotal), grand_total: rounded };
}
