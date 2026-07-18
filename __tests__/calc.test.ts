import { computeBillSplit, computeItemFinalPrice, expandItemsToUnits, splitTip } from '../src/lib/calc';

describe('expandItemsToUnits', () => {
  it('splits a multi-quantity item into one unit per item ordered, each with its own assignment', () => {
    const units = expandItemsToUnits([
      { id: 'item-1', name: 'Bottle of Water', unitPrice: 100, qty: 3, unitAssignments: [['alice'], ['bob'], ['alice', 'bob']] },
    ]);
    expect(units).toHaveLength(3);
    expect(units[0]).toMatchObject({ id: 'item-1:0', sourceId: 'item-1', unitIndex: 0, totalUnits: 3, assignedFriendIds: ['alice'] });
    expect(units[1]).toMatchObject({ id: 'item-1:1', unitIndex: 1, assignedFriendIds: ['bob'] });
    expect(units[2]).toMatchObject({ id: 'item-1:2', unitIndex: 2, assignedFriendIds: ['alice', 'bob'] });
  });

  it('defaults a missing unit assignment to unassigned rather than throwing', () => {
    const units = expandItemsToUnits([{ id: 'item-1', name: 'Fries', unitPrice: 50, qty: 2, unitAssignments: [['alice']] }]);
    expect(units[1].assignedFriendIds).toEqual([]);
  });

  it('produces one unit for a qty-1 item, matching pre-existing single-item behavior', () => {
    const units = expandItemsToUnits([{ id: 'item-1', name: 'Karahi', unitPrice: 400, qty: 1, unitAssignments: [['alice']] }]);
    expect(units).toEqual([
      { id: 'item-1:0', sourceId: 'item-1', name: 'Karahi', unitPrice: 400, unitIndex: 0, totalUnits: 1, assignedFriendIds: ['alice'] },
    ]);
  });
});

describe('computeItemFinalPrice', () => {
  it('matches the worked example: 100 rupee item, 10% discount, 8% tax -> 98', () => {
    const result = computeItemFinalPrice(100, {
      subtotal: 100,
      discountPercent: 0.1,
      taxPercent: 0.08,
    });
    expect(result).toBe(98);
  });

  it('does not compound discount and tax (would be 97.2 if compounded)', () => {
    const result = computeItemFinalPrice(100, {
      subtotal: 100,
      discountPercent: 0.1,
      taxPercent: 0.08,
    });
    expect(result).not.toBeCloseTo(100 * 0.9 * 1.08, 2);
  });

  it('applies no adjustment when there is no discount or tax', () => {
    expect(computeItemFinalPrice(250, { subtotal: 250 })).toBe(250);
  });

  it('applies tax only when there is no discount', () => {
    expect(computeItemFinalPrice(100, { subtotal: 100, taxPercent: 0.08 })).toBe(108);
  });

  it('applies discount only when there is no tax', () => {
    expect(computeItemFinalPrice(100, { subtotal: 100, discountPercent: 0.1 })).toBe(90);
  });

  it('prorates a flat discount amount across items by subtotal share', () => {
    // subtotal 200 (two 100-rupee items), flat 20 rupee discount => 10% effective rate per item
    const result = computeItemFinalPrice(100, { subtotal: 200, discountAmount: 20 });
    expect(result).toBe(90);
  });

  it('prorates a flat tax amount across items by subtotal share', () => {
    const result = computeItemFinalPrice(100, { subtotal: 200, taxAmount: 16 });
    expect(result).toBe(108);
  });

  it('prefers an explicit percent over a flat amount when both are present', () => {
    const result = computeItemFinalPrice(100, { subtotal: 100, discountPercent: 0.1, discountAmount: 999 });
    expect(result).toBe(90);
  });
});

describe('splitTip', () => {
  it('splits evenly across friends regardless of their item totals', () => {
    const result = splitTip(100, { a: 300, b: 100 }, 'even');
    expect(result).toEqual({ a: 50, b: 50 });
  });

  it('splits proportionally to each friend item total', () => {
    const result = splitTip(100, { a: 300, b: 100 }, 'proportional');
    expect(result).toEqual({ a: 75, b: 25 });
  });

  it('falls back to even split when proportional totals sum to zero', () => {
    const result = splitTip(50, { a: 0, b: 0 }, 'proportional');
    expect(result).toEqual({ a: 25, b: 25 });
  });

  it('returns zero shares when tip is zero', () => {
    const result = splitTip(0, { a: 10, b: 20 }, 'even');
    expect(result).toEqual({ a: 0, b: 0 });
  });

  it('excludes friends not in eligibleFriendIds from an even split, giving them an explicit 0', () => {
    const result = splitTip(100, { a: 100, b: 100, c: 100 }, 'even', ['a', 'b']);
    expect(result).toEqual({ a: 50, b: 50, c: 0 });
  });

  it('excludes friends not in eligibleFriendIds from a proportional split too', () => {
    // c is excluded, so only a/b's totals (300 + 100) count toward the ratio
    const result = splitTip(100, { a: 300, b: 100, c: 500 }, 'proportional', ['a', 'b']);
    expect(result).toEqual({ a: 75, b: 25, c: 0 });
  });

  it('defaults to everyone when eligibleFriendIds is omitted (backward compatible)', () => {
    const result = splitTip(100, { a: 300, b: 100 }, 'even');
    expect(result).toEqual({ a: 50, b: 50 });
  });
});

describe('computeBillSplit', () => {
  it('splits a shared item evenly between assignees and applies bill-wide discount/tax', () => {
    // Two items: water (100, shared by a+b) and soda (100, assigned to a only)
    // subtotal 200, 10% discount, 8% tax => each line item final = lineTotal * 0.98
    const result = computeBillSplit({
      items: [
        { id: 'water', unitPrice: 100, qty: 1, assignedFriendIds: ['a', 'b'] },
        { id: 'soda', unitPrice: 100, qty: 1, assignedFriendIds: ['a'] },
      ],
      subtotal: 200,
      discountPercent: 0.1,
      taxPercent: 0.08,
      friendIds: ['a', 'b'],
    });

    expect(result.items.find((i) => i.id === 'water')?.finalPrice).toBe(98);
    expect(result.items.find((i) => i.id === 'soda')?.finalPrice).toBe(98);
    // a: half of water (49) + all of soda (98) = 147; b: half of water (49)
    expect(result.perFriendItemTotal.a).toBe(147);
    expect(result.perFriendItemTotal.b).toBe(49);
    expect(result.grandTotal).toBe(196);
  });

  it('folds a cash tip into per-friend totals using the given split mode', () => {
    const result = computeBillSplit({
      items: [
        { id: 'burger', unitPrice: 300, qty: 1, assignedFriendIds: ['a'] },
        { id: 'fries', unitPrice: 100, qty: 1, assignedFriendIds: ['b'] },
      ],
      subtotal: 400,
      friendIds: ['a', 'b'],
      tipAmount: 40,
      tipSplitMode: 'proportional',
    });

    expect(result.perFriendItemTotal).toEqual({ a: 300, b: 100 });
    expect(result.perFriendTip).toEqual({ a: 30, b: 10 });
    expect(result.perFriendTotal).toEqual({ a: 330, b: 110 });
    expect(result.grandTotal).toBe(440);
  });

  it('handles a quantity greater than one on a single line item', () => {
    const result = computeBillSplit({
      items: [{ id: 'water', unitPrice: 100, qty: 2, assignedFriendIds: ['a', 'b'] }],
      subtotal: 200,
      discountPercent: 0.1,
      taxPercent: 0.08,
      friendIds: ['a', 'b'],
    });

    expect(result.items[0].lineTotal).toBe(200);
    expect(result.items[0].finalPrice).toBe(196);
    expect(result.perFriendItemTotal).toEqual({ a: 98, b: 98 });
  });
});
