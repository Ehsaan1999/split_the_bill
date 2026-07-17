export interface Friend {
  id: string;
  name: string;
}

export interface ReceiptItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface ParsedReceipt {
  merchant: string | null;
  items: ReceiptItem[];
  subtotal: number | null;
  discountPercent: number | null;
  discountAmount: number | null;
  taxPercent: number | null;
  taxAmount: number | null;
  total: number | null;
  source: 'on-device' | 'cloud';
}

export type TipSplitMode = 'even' | 'proportional';
