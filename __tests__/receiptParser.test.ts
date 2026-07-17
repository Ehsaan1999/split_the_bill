import { getEffectiveSubtotal, isParseConfident, parseReceiptText } from '../src/lib/receiptParser';

describe('parseReceiptText', () => {
  it('extracts items, subtotal, discount percent, and tax percent from a typical receipt', () => {
    const raw = `
      SPICE GARDEN RESTAURANT
      Table No: 12
      Date: 12/07/2026
      Bottle of Water        100.00
      2x Chicken Karahi       800.00
      Naan                     50.00
      Sub Total               950.00
      Discount               10%
      GST                     8%
      Total                   931.00
    `;

    const parsed = parseReceiptText(raw);

    expect(parsed.items).toEqual([
      { id: 'parsed-1', name: 'Bottle of Water', qty: 1, unitPrice: 100 },
      { id: 'parsed-2', name: 'Chicken Karahi', qty: 2, unitPrice: 400 },
      { id: 'parsed-3', name: 'Naan', qty: 1, unitPrice: 50 },
    ]);
    expect(parsed.subtotal).toBe(950);
    expect(parsed.discountPercent).toBe(0.1);
    expect(parsed.taxPercent).toBe(0.08);
    expect(parsed.total).toBe(931);
  });

  it('ignores header metadata lines that contain numbers', () => {
    const raw = `
      Table No: 12
      Phone: 021-1234567
      Burger                  500.00
      Total                   500.00
    `;
    const parsed = parseReceiptText(raw);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].name).toBe('Burger');
  });

  it('captures a flat-amount discount and tax when no percent sign is present', () => {
    const raw = `
      Burger                  500.00
      Fries                   200.00
      Sub Total                700.00
      Discount                  70.00
      Tax                       50.40
      Total                     680.40
    `;
    const parsed = parseReceiptText(raw);
    expect(parsed.discountAmount).toBe(70);
    expect(parsed.taxAmount).toBe(50.4);
  });

  it('leaves subtotal null when no subtotal line is present', () => {
    const raw = `
      Burger                  500.00
      Total                   500.00
    `;
    const parsed = parseReceiptText(raw);
    expect(parsed.subtotal).toBeNull();
  });
});

describe('getEffectiveSubtotal', () => {
  it('uses the explicit subtotal when present', () => {
    const parsed = parseReceiptText('Burger 500.00\nSub Total 500.00\nTotal 500.00');
    expect(getEffectiveSubtotal(parsed)).toBe(500);
  });

  it('falls back to summing item lines when no subtotal was detected', () => {
    const parsed = parseReceiptText('Burger 500.00\nFries 200.00\nTotal 700.00');
    expect(parsed.subtotal).toBeNull();
    expect(getEffectiveSubtotal(parsed)).toBe(700);
  });
});

describe('isParseConfident', () => {
  it('is confident when items reconcile with the stated subtotal', () => {
    const parsed = parseReceiptText('Burger 500.00\nFries 200.00\nSub Total 700.00\nTotal 700.00');
    expect(isParseConfident(parsed)).toBe(true);
  });

  it('is not confident when there is no subtotal line to reconcile against', () => {
    const parsed = parseReceiptText('Burger 500.00\nTotal 500.00');
    expect(isParseConfident(parsed)).toBe(false);
  });

  it('is not confident when items do not reconcile with the subtotal (missed a line item)', () => {
    const parsed = parseReceiptText('Burger 500.00\nSub Total 900.00\nTotal 900.00');
    expect(isParseConfident(parsed)).toBe(false);
  });

  it('is not confident when no items were found', () => {
    const parsed = parseReceiptText('Sub Total 900.00\nTotal 900.00');
    expect(isParseConfident(parsed)).toBe(false);
  });
});
