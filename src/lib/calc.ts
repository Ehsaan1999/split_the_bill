import type { TipSplitMode } from '../types/bill';

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface BillTotals {
  subtotal: number;
  discountPercent?: number | null;
  discountAmount?: number | null;
  taxPercent?: number | null;
  taxAmount?: number | null;
}

/**
 * A whole-bill discount/tax stated as a flat rupee amount is prorated into an
 * equivalent rate (amount / subtotal) so it can be applied per item the same
 * way a stated percentage would be.
 */
export function getEffectiveRate(
  percent: number | null | undefined,
  amount: number | null | undefined,
  subtotal: number
): number {
  if (percent != null) return percent;
  if (amount != null && subtotal > 0) return amount / subtotal;
  return 0;
}

/**
 * Discount and tax are both computed against the item's original price and
 * netted, not compounded: a 100-rupee item with 10% discount and 8% tax is
 * 98 (100 - 10 + 8), not 100 * 0.9 * 1.08.
 */
export function computeItemFinalPrice(itemLineTotal: number, totals: BillTotals): number {
  const discountRate = getEffectiveRate(totals.discountPercent, totals.discountAmount, totals.subtotal);
  const taxRate = getEffectiveRate(totals.taxPercent, totals.taxAmount, totals.subtotal);
  return round2(itemLineTotal * (1 - discountRate + taxRate));
}

export function splitItemAmongFriends(finalPrice: number, friendIds: string[]): Record<string, number> {
  if (friendIds.length === 0) return {};
  const share = finalPrice / friendIds.length;
  return Object.fromEntries(friendIds.map((id) => [id, round2(share)]));
}

export function splitTip(
  tipAmount: number,
  friendItemTotals: Record<string, number>,
  mode: TipSplitMode
): Record<string, number> {
  const friendIds = Object.keys(friendItemTotals);
  if (friendIds.length === 0 || tipAmount === 0) {
    return Object.fromEntries(friendIds.map((id) => [id, 0]));
  }

  if (mode === 'proportional') {
    const sumTotals = friendIds.reduce((sum, id) => sum + friendItemTotals[id], 0);
    if (sumTotals > 0) {
      return Object.fromEntries(
        friendIds.map((id) => [id, round2(tipAmount * (friendItemTotals[id] / sumTotals))])
      );
    }
  }

  const share = tipAmount / friendIds.length;
  return Object.fromEntries(friendIds.map((id) => [id, round2(share)]));
}

export interface BillItemInput {
  id: string;
  unitPrice: number;
  qty: number;
  assignedFriendIds: string[];
}

export interface ComputeBillSplitInput {
  items: BillItemInput[];
  subtotal: number;
  discountPercent?: number | null;
  discountAmount?: number | null;
  taxPercent?: number | null;
  taxAmount?: number | null;
  tipAmount?: number;
  tipSplitMode?: TipSplitMode;
  friendIds: string[];
}

export interface BillItemResult {
  id: string;
  lineTotal: number;
  finalPrice: number;
  perFriendShare: Record<string, number>;
}

export interface ComputeBillSplitResult {
  items: BillItemResult[];
  perFriendItemTotal: Record<string, number>;
  perFriendTip: Record<string, number>;
  perFriendTotal: Record<string, number>;
  grandTotal: number;
}

export function computeBillSplit(input: ComputeBillSplitInput): ComputeBillSplitResult {
  const totals: BillTotals = {
    subtotal: input.subtotal,
    discountPercent: input.discountPercent,
    discountAmount: input.discountAmount,
    taxPercent: input.taxPercent,
    taxAmount: input.taxAmount,
  };

  const perFriendItemTotal: Record<string, number> = Object.fromEntries(input.friendIds.map((id) => [id, 0]));

  const items: BillItemResult[] = input.items.map((item) => {
    const lineTotal = round2(item.unitPrice * item.qty);
    const finalPrice = computeItemFinalPrice(lineTotal, totals);
    const perFriendShare = splitItemAmongFriends(finalPrice, item.assignedFriendIds);
    for (const [friendId, share] of Object.entries(perFriendShare)) {
      perFriendItemTotal[friendId] = round2((perFriendItemTotal[friendId] ?? 0) + share);
    }
    return { id: item.id, lineTotal, finalPrice, perFriendShare };
  });

  const perFriendTip = splitTip(input.tipAmount ?? 0, perFriendItemTotal, input.tipSplitMode ?? 'even');

  const perFriendTotal: Record<string, number> = {};
  let grandTotal = 0;
  for (const friendId of input.friendIds) {
    const total = round2((perFriendItemTotal[friendId] ?? 0) + (perFriendTip[friendId] ?? 0));
    perFriendTotal[friendId] = total;
    grandTotal = round2(grandTotal + total);
  }

  return { items, perFriendItemTotal, perFriendTip, perFriendTotal, grandTotal };
}
