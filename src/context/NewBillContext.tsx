import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { DiscountTaxMode, UnitSplitMode } from '../lib/calc';
import { generateId } from '../lib/id';
import type { TipSplitMode } from '../types/bill';

export const MANUAL_BATCH_ID = 'manual';

export interface ReceiptBatch {
  id: string;
  label: string;
  subtotal: number;
  discountPercent: number | null;
  discountAmount: number | null;
  taxPercent: number | null;
  taxAmount: number | null;
}

export interface DraftItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  batchId: string;
  /** One entry per unit (length === qty) — who's sharing that specific unit. */
  unitAssignments: string[][];
  /** One entry per unit (length === qty) — 'even' (split) or 'each' (full price per person). */
  unitSplitModes: UnitSplitMode[];
}

interface NewBillState {
  merchant: string | null;
  participantIds: string[];
  items: DraftItem[];
  batches: ReceiptBatch[];
  discountTaxMode: DiscountTaxMode;
  // "Flat" mode totals — used for every item when discountTaxMode === 'flat'.
  subtotal: number;
  discountPercent: number | null;
  discountAmount: number | null;
  taxPercent: number | null;
  taxAmount: number | null;
  tipAmount: number;
  tipSplitMode: TipSplitMode;
}

interface BillTotalsPatch {
  subtotal: number;
  discountPercent: number | null;
  discountAmount: number | null;
  taxPercent: number | null;
  taxAmount: number | null;
}

interface NewItemInput {
  name: string;
  qty: number;
  unitPrice: number;
}

/** Resizes a per-unit array to a new qty, preserving existing entries and padding new ones with `fill`. */
function resizeUnitArray<T>(arr: T[], newQty: number, fill: T): T[] {
  const safeQty = Number.isFinite(newQty) && newQty > 0 ? Math.floor(newQty) : 0;
  const next = arr.slice(0, safeQty);
  while (next.length < safeQty) next.push(fill);
  return next;
}

function makeDraftItems(items: NewItemInput[], batchId: string): DraftItem[] {
  return items.map((item) => {
    const qty = Number.isFinite(item.qty) && item.qty > 0 ? Math.floor(item.qty) : 1;
    return {
      id: generateId(),
      name: item.name,
      qty,
      unitPrice: item.unitPrice,
      batchId,
      unitAssignments: Array.from({ length: qty }, () => []),
      unitSplitModes: Array.from({ length: qty }, () => 'even' as UnitSplitMode),
    };
  });
}

interface NewBillContextValue extends NewBillState {
  setMerchant: (merchant: string | null) => void;
  setParticipantIds: (ids: string[]) => void;
  setItems: (items: DraftItem[]) => void;
  addItem: () => void;
  updateItem: (id: string, patch: Partial<Pick<DraftItem, 'name' | 'qty' | 'unitPrice'>>) => void;
  removeItem: (id: string) => void;
  setUnitAssignment: (itemId: string, unitIndex: number, friendIds: string[]) => void;
  setUnitSplitMode: (itemId: string, unitIndex: number, mode: UnitSplitMode) => void;
  /** Adds a new batch (one scan's worth of items) plus its items in one go; returns the new batch id. */
  addBatch: (batch: Omit<ReceiptBatch, 'id'>, items: NewItemInput[]) => string;
  updateBatch: (batchId: string, patch: Partial<Omit<ReceiptBatch, 'id'>>) => void;
  setDiscountTaxMode: (mode: DiscountTaxMode) => void;
  setBillTotals: (totals: BillTotalsPatch) => void;
  setTip: (amount: number, mode: TipSplitMode) => void;
  reset: () => void;
}

const initialState: NewBillState = {
  merchant: null,
  participantIds: [],
  items: [],
  batches: [],
  discountTaxMode: 'flat',
  subtotal: 0,
  discountPercent: null,
  discountAmount: null,
  taxPercent: null,
  taxAmount: null,
  tipAmount: 0,
  tipSplitMode: 'even',
};

const NewBillContext = createContext<NewBillContextValue | null>(null);

export function NewBillProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<NewBillState>(initialState);

  // Every setter below uses the functional setState form (no closure over `state`), so each
  // can be wrapped in useCallback with an empty dependency array and keep a stable identity
  // across renders — an identity that changed on every state update was making PickReceiptScreen's
  // useFocusEffect re-fire (and re-fetch/re-reset) a second time on every screen focus.
  const setMerchant = useCallback((merchant: string | null) => setState((s) => ({ ...s, merchant })), []);
  const setParticipantIds = useCallback((participantIds: string[]) => setState((s) => ({ ...s, participantIds })), []);
  const setItems = useCallback((items: DraftItem[]) => setState((s) => ({ ...s, items })), []);

  const addItem = useCallback(
    () =>
      setState((s) => {
        const hasManualBatch = s.batches.some((b) => b.id === MANUAL_BATCH_ID);
        const batches = hasManualBatch
          ? s.batches
          : [
              ...s.batches,
              {
                id: MANUAL_BATCH_ID,
                label: 'Manually added',
                subtotal: 0,
                discountPercent: null,
                discountAmount: null,
                taxPercent: null,
                taxAmount: null,
              },
            ];
        return {
          ...s,
          batches,
          items: [
            ...s.items,
            {
              id: generateId(),
              name: '',
              qty: 1,
              unitPrice: 0,
              batchId: MANUAL_BATCH_ID,
              unitAssignments: [[]],
              unitSplitModes: ['even'],
            },
          ],
        };
      }),
    []
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<Pick<DraftItem, 'name' | 'qty' | 'unitPrice'>>) =>
      setState((s) => ({
        ...s,
        items: s.items.map((item) => {
          if (item.id !== id) return item;
          const next = { ...item, ...patch };
          // A qty change must keep unitAssignments/unitSplitModes in lockstep (one entry per
          // unit) — otherwise per-unit assignment on AssignFriendsScreen reads stale/missing slots.
          if (patch.qty != null && patch.qty !== item.qty) {
            next.unitAssignments = resizeUnitArray(item.unitAssignments, patch.qty, []);
            next.unitSplitModes = resizeUnitArray(item.unitSplitModes, patch.qty, 'even');
          }
          return next;
        }),
      })),
    []
  );

  const removeItem = useCallback(
    (id: string) => setState((s) => ({ ...s, items: s.items.filter((item) => item.id !== id) })),
    []
  );

  const setUnitAssignment = useCallback(
    (itemId: string, unitIndex: number, friendIds: string[]) =>
      setState((s) => ({
        ...s,
        items: s.items.map((item) => {
          if (item.id !== itemId) return item;
          const unitAssignments = item.unitAssignments.slice();
          unitAssignments[unitIndex] = friendIds;
          return { ...item, unitAssignments };
        }),
      })),
    []
  );

  const setUnitSplitMode = useCallback(
    (itemId: string, unitIndex: number, mode: UnitSplitMode) =>
      setState((s) => ({
        ...s,
        items: s.items.map((item) => {
          if (item.id !== itemId) return item;
          const unitSplitModes = item.unitSplitModes.slice();
          unitSplitModes[unitIndex] = mode;
          return { ...item, unitSplitModes };
        }),
      })),
    []
  );

  const addBatch = useCallback((batch: Omit<ReceiptBatch, 'id'>, items: NewItemInput[]) => {
    const batchId = generateId();
    setState((s) => ({
      ...s,
      batches: [...s.batches, { ...batch, id: batchId }],
      items: [...s.items, ...makeDraftItems(items, batchId)],
    }));
    return batchId;
  }, []);

  const updateBatch = useCallback(
    (batchId: string, patch: Partial<Omit<ReceiptBatch, 'id'>>) =>
      setState((s) => ({
        ...s,
        batches: s.batches.map((b) => (b.id === batchId ? { ...b, ...patch } : b)),
      })),
    []
  );

  const setDiscountTaxMode = useCallback(
    (discountTaxMode: DiscountTaxMode) => setState((s) => ({ ...s, discountTaxMode })),
    []
  );

  const setBillTotals = useCallback((totals: BillTotalsPatch) => setState((s) => ({ ...s, ...totals })), []);
  const setTip = useCallback(
    (tipAmount: number, tipSplitMode: TipSplitMode) => setState((s) => ({ ...s, tipAmount, tipSplitMode })),
    []
  );
  const reset = useCallback(() => setState(initialState), []);

  const value = useMemo<NewBillContextValue>(
    () => ({
      ...state,
      setMerchant,
      setParticipantIds,
      setItems,
      addItem,
      updateItem,
      removeItem,
      setUnitAssignment,
      setUnitSplitMode,
      addBatch,
      updateBatch,
      setDiscountTaxMode,
      setBillTotals,
      setTip,
      reset,
    }),
    [
      state,
      setMerchant,
      setParticipantIds,
      setItems,
      addItem,
      updateItem,
      removeItem,
      setUnitAssignment,
      setUnitSplitMode,
      addBatch,
      updateBatch,
      setDiscountTaxMode,
      setBillTotals,
      setTip,
      reset,
    ]
  );

  return <NewBillContext.Provider value={value}>{children}</NewBillContext.Provider>;
}

export function useNewBill(): NewBillContextValue {
  const ctx = useContext(NewBillContext);
  if (!ctx) throw new Error('useNewBill must be used within a NewBillProvider');
  return ctx;
}
