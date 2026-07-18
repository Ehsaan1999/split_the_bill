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

export type UnitSplitMode = 'even' | 'each';

/**
 * 'even' (default): the unit's price is one charge, divided across whoever's tapped —
 * e.g. one Rs100 parking ticket shared by 2 people is Rs50 each.
 * 'each': every tapped person owes the *full* price individually — e.g. Rs1000 bowling
 * where each of 3 people played their own game is Rs1000 each, not Rs1000 split 3 ways.
 */
export function splitItemAmongFriends(
  finalPrice: number,
  friendIds: string[],
  mode: UnitSplitMode = 'even'
): Record<string, number> {
  if (friendIds.length === 0) return {};
  if (mode === 'each') {
    return Object.fromEntries(friendIds.map((id) => [id, round2(finalPrice)]));
  }
  const share = finalPrice / friendIds.length;
  return Object.fromEntries(friendIds.map((id) => [id, round2(share)]));
}

/**
 * Splits the tip across `eligibleFriendIds` only (default: everyone in friendItemTotals) — so
 * someone who wasn't in on the tip (left early, tipped cash separately, etc.) can be excluded.
 * Excluded friends still get an explicit 0 entry rather than being omitted, so callers can
 * render "not included" instead of just missing data.
 */
export function splitTip(
  tipAmount: number,
  friendItemTotals: Record<string, number>,
  mode: TipSplitMode,
  eligibleFriendIds?: string[]
): Record<string, number> {
  const allFriendIds = Object.keys(friendItemTotals);
  const eligible = (eligibleFriendIds ?? allFriendIds).filter((id) => allFriendIds.includes(id));
  const result: Record<string, number> = Object.fromEntries(allFriendIds.map((id) => [id, 0]));

  if (eligible.length === 0 || tipAmount === 0) {
    return result;
  }

  if (mode === 'proportional') {
    const sumTotals = eligible.reduce((sum, id) => sum + friendItemTotals[id], 0);
    if (sumTotals > 0) {
      for (const id of eligible) {
        result[id] = round2(tipAmount * (friendItemTotals[id] / sumTotals));
      }
      return result;
    }
  }

  const share = tipAmount / eligible.length;
  for (const id of eligible) {
    result[id] = round2(share);
  }
  return result;
}

/** Which receipt (or the implicit "manual" batch) an item's discount/tax should be looked up from. */
export type BatchId = string;

export interface BillItemInput {
  id: string;
  unitPrice: number;
  qty: number;
  assignedFriendIds: string[];
  splitMode?: UnitSplitMode;
  batchId?: BatchId;
}

export interface LineItemWithUnitAssignments {
  id: string;
  name: string;
  unitPrice: number;
  qty: number;
  batchId: BatchId;
  /** One entry per unit (length === qty) — who's sharing that specific unit. */
  unitAssignments: string[][];
  /** One entry per unit (length === qty) — 'even' (default) or 'each'. */
  unitSplitModes: UnitSplitMode[];
}

export interface ExpandedUnit {
  id: string;
  sourceId: string;
  name: string;
  unitPrice: number;
  unitIndex: number;
  totalUnits: number;
  batchId: BatchId;
  assignedFriendIds: string[];
  splitMode: UnitSplitMode;
}

/**
 * Splits each multi-quantity line into one qty-1 "unit" per item ordered, each carrying its
 * own assignment — so 3 bottles of water can go to 3 different people instead of the whole
 * line being forced to split evenly across whoever's tapped. Used identically before both
 * computing the on-screen split and persisting a saved bill, so the two never drift apart.
 */
export function expandItemsToUnits(items: LineItemWithUnitAssignments[]): ExpandedUnit[] {
  const units: ExpandedUnit[] = [];
  for (const item of items) {
    for (let unitIndex = 0; unitIndex < item.qty; unitIndex++) {
      units.push({
        id: `${item.id}:${unitIndex}`,
        sourceId: item.id,
        name: item.name,
        unitPrice: item.unitPrice,
        unitIndex,
        totalUnits: item.qty,
        batchId: item.batchId,
        assignedFriendIds: item.unitAssignments[unitIndex] ?? [],
        splitMode: item.unitSplitModes[unitIndex] ?? 'even',
      });
    }
  }
  return units;
}

export type DiscountTaxMode = 'flat' | 'isolated';

export interface ComputeBillSplitInput {
  items: BillItemInput[];
  subtotal: number;
  discountPercent?: number | null;
  discountAmount?: number | null;
  taxPercent?: number | null;
  taxAmount?: number | null;
  /**
   * 'flat' (default): the discount/tax fields above apply to every item, regardless of batch —
   * matches a single receipt or a bill where all items share one discount.
   * 'isolated': each item instead uses its own batch's totals from `batchTotals` (a batch with
   * no entry, e.g. manually-added items, gets no discount/tax at all) — for bills combining a
   * discounted receipt with un-discounted manual extras, or multiple receipts with different terms.
   */
  discountTaxMode?: DiscountTaxMode;
  batchTotals?: Record<BatchId, BillTotals>;
  tipAmount?: number;
  tipSplitMode?: TipSplitMode;
  /** Friends who share the tip; defaults to all of `friendIds`. */
  tipEligibleFriendIds?: string[];
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
    const itemTotals: BillTotals =
      input.discountTaxMode === 'isolated'
        ? (input.batchTotals?.[item.batchId ?? ''] ?? { subtotal: 0 })
        : totals;
    const finalPrice = computeItemFinalPrice(lineTotal, itemTotals);
    const perFriendShare = splitItemAmongFriends(finalPrice, item.assignedFriendIds, item.splitMode);
    for (const [friendId, share] of Object.entries(perFriendShare)) {
      perFriendItemTotal[friendId] = round2((perFriendItemTotal[friendId] ?? 0) + share);
    }
    return { id: item.id, lineTotal, finalPrice, perFriendShare };
  });

  const perFriendTip = splitTip(
    input.tipAmount ?? 0,
    perFriendItemTotal,
    input.tipSplitMode ?? 'even',
    input.tipEligibleFriendIds
  );

  const perFriendTotal: Record<string, number> = {};
  let grandTotal = 0;
  for (const friendId of input.friendIds) {
    const total = round2((perFriendItemTotal[friendId] ?? 0) + (perFriendTip[friendId] ?? 0));
    perFriendTotal[friendId] = total;
    grandTotal = round2(grandTotal + total);
  }

  return { items, perFriendItemTotal, perFriendTip, perFriendTotal, grandTotal };
}
