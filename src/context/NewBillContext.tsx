import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { generateId } from '../lib/id';
import type { TipSplitMode } from '../types/bill';

export interface DraftItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  /** One entry per unit (length always === qty) — who's sharing that specific unit. */
  unitAssignments: string[][];
}

/** Resizes a unit-assignment list to a new qty, preserving existing units and padding new ones empty. */
function resizeUnitAssignments(unitAssignments: string[][], newQty: number): string[][] {
  const safeQty = Number.isFinite(newQty) && newQty > 0 ? Math.floor(newQty) : 0;
  const next = unitAssignments.slice(0, safeQty);
  while (next.length < safeQty) next.push([]);
  return next;
}

interface NewBillState {
  merchant: string | null;
  participantIds: string[];
  items: DraftItem[];
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

interface NewBillContextValue extends NewBillState {
  setMerchant: (merchant: string | null) => void;
  setParticipantIds: (ids: string[]) => void;
  setItems: (items: DraftItem[]) => void;
  addItem: () => void;
  updateItem: (id: string, patch: Partial<DraftItem>) => void;
  removeItem: (id: string) => void;
  setUnitAssignment: (itemId: string, unitIndex: number, friendIds: string[]) => void;
  setBillTotals: (totals: BillTotalsPatch) => void;
  setTip: (amount: number, mode: TipSplitMode) => void;
  reset: () => void;
}

const initialState: NewBillState = {
  merchant: null,
  participantIds: [],
  items: [],
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
  // across renders. That stability matters: consumers like PickReceiptScreen depend on `reset`
  // inside a useFocusEffect's useCallback — an identity that changed on every state update was
  // making the focus effect re-fire (and re-fetch/re-reset) a second time on every screen focus.
  const setMerchant = useCallback((merchant: string | null) => setState((s) => ({ ...s, merchant })), []);
  const setParticipantIds = useCallback((participantIds: string[]) => setState((s) => ({ ...s, participantIds })), []);
  const setItems = useCallback((items: DraftItem[]) => setState((s) => ({ ...s, items })), []);
  const addItem = useCallback(
    () =>
      setState((s) => ({
        ...s,
        items: [...s.items, { id: generateId(), name: '', qty: 1, unitPrice: 0, unitAssignments: [[]] }],
      })),
    []
  );
  const updateItem = useCallback(
    (id: string, patch: Partial<DraftItem>) =>
      setState((s) => ({
        ...s,
        items: s.items.map((item) => {
          if (item.id !== id) return item;
          const next = { ...item, ...patch };
          // A qty change must keep unitAssignments in lockstep (one entry per unit) —
          // otherwise per-unit assignment in AssignFriendsScreen would read stale/missing slots.
          if (patch.qty != null && patch.qty !== item.qty) {
            next.unitAssignments = resizeUnitAssignments(item.unitAssignments, patch.qty);
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
