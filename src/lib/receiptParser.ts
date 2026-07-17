import type { ParsedReceipt, ReceiptItem } from '../types/bill';

const IGNORE_LINE_RE =
  /^(table|receipt|invoice|order|date|time|cashier|server|phone|tel|address|www\.|gstin|tin|thank you|welcome)/i;
const DISCOUNT_RE = /\b(discount|disc)\b/i;
const TAX_RE = /\b(tax|gst|vat)\b/i;
const SUBTOTAL_RE = /\bsub\s*-?\s*total\b/i;
const TOTAL_RE = /\btotal\b/i;
const TRAILING_PRICE_RE = /(?:rs\.?|pkr|₨|\$)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s*$/i;
const PERCENT_RE = /(\d{1,3}(?:\.\d{1,2})?)\s*%/;
const LEADING_QTY_RE = /^(\d+)\s*[xX]\s*(.+)$/;

function parseNumber(raw: string): number {
  return parseFloat(raw.replace(/,/g, ''));
}

function extractTrailingPrice(line: string): { price: number; rest: string } | null {
  const match = line.match(TRAILING_PRICE_RE);
  if (!match || match.index == null) return null;
  const price = parseNumber(match[1]);
  if (Number.isNaN(price)) return null;
  const rest = line.slice(0, match.index).trim();
  return { price, rest };
}

/**
 * Best-effort heuristic parse of raw OCR text into a structured receipt.
 * Fields that can't be confidently detected are left null rather than
 * guessed, so isParseConfident/getEffectiveSubtotal can make an honest call
 * about whether to fall back to the cloud parser.
 */
export function parseReceiptText(rawText: string): ParsedReceipt {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const items: ReceiptItem[] = [];
  let subtotal: number | null = null;
  let total: number | null = null;
  let discountPercent: number | null = null;
  let discountAmount: number | null = null;
  let taxPercent: number | null = null;
  let taxAmount: number | null = null;
  let itemCounter = 0;

  for (const line of lines) {
    if (IGNORE_LINE_RE.test(line)) continue;

    const trailing = extractTrailingPrice(line);

    if (DISCOUNT_RE.test(line)) {
      const pctMatch = line.match(PERCENT_RE);
      if (pctMatch) {
        discountPercent = parseNumber(pctMatch[1]) / 100;
      } else if (trailing) {
        discountAmount = trailing.price;
      }
      continue;
    }

    if (TAX_RE.test(line)) {
      const pctMatch = line.match(PERCENT_RE);
      if (pctMatch) {
        taxPercent = parseNumber(pctMatch[1]) / 100;
      } else if (trailing) {
        taxAmount = trailing.price;
      }
      continue;
    }

    if (SUBTOTAL_RE.test(line)) {
      if (trailing) subtotal = trailing.price;
      continue;
    }

    if (TOTAL_RE.test(line)) {
      if (trailing) total = trailing.price;
      continue;
    }

    if (!trailing || trailing.rest.length === 0) continue;

    let qty = 1;
    let name = trailing.rest;
    const qtyMatch = name.match(LEADING_QTY_RE);
    if (qtyMatch) {
      qty = parseInt(qtyMatch[1], 10) || 1;
      name = qtyMatch[2].trim();
    }

    if (name.length === 0) continue;

    itemCounter += 1;
    items.push({
      id: `parsed-${itemCounter}`,
      name,
      qty,
      unitPrice: qty > 0 ? trailing.price / qty : trailing.price,
    });
  }

  return {
    merchant: null,
    items,
    subtotal,
    discountPercent,
    discountAmount,
    taxPercent,
    taxAmount,
    total,
    source: 'on-device',
  };
}

/** Subtotal to feed the calc engine when the receipt didn't have an explicit subtotal line. */
export function getEffectiveSubtotal(parsed: ParsedReceipt): number {
  if (parsed.subtotal != null) return parsed.subtotal;
  return parsed.items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
}

const RECONCILE_ABS_TOLERANCE = 1;
const RECONCILE_PCT_TOLERANCE = 0.02;

/**
 * Whether the on-device parse looks trustworthy enough to skip the cloud
 * fallback: it found at least one item, an explicit subtotal line, and the
 * items sum to roughly that subtotal.
 */
export function isParseConfident(parsed: ParsedReceipt): boolean {
  if (parsed.items.length === 0) return false;
  if (parsed.subtotal == null) return false;

  const itemSum = parsed.items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const diff = Math.abs(itemSum - parsed.subtotal);
  return diff <= RECONCILE_ABS_TOLERANCE || diff / parsed.subtotal <= RECONCILE_PCT_TOLERANCE;
}
