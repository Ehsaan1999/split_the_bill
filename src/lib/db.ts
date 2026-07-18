import * as SQLite from 'expo-sqlite';
import type { Friend, TipSplitMode } from '../types/bill';
import { computeBillSplit, expandItemsToUnits } from './calc';
import { generateId } from './id';

const DB_NAME = 'split_the_bill.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS friends (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS bills (
          id TEXT PRIMARY KEY,
          date TEXT NOT NULL,
          merchant TEXT,
          subtotal REAL NOT NULL,
          discount_percent REAL,
          discount_amount REAL,
          tax_percent REAL,
          tax_amount REAL,
          tip_amount REAL NOT NULL DEFAULT 0,
          tip_split_mode TEXT NOT NULL DEFAULT 'even',
          total REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS bill_items (
          id TEXT PRIMARY KEY,
          bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          qty REAL NOT NULL,
          unit_price REAL NOT NULL,
          final_price REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS item_assignments (
          item_id TEXT NOT NULL REFERENCES bill_items(id) ON DELETE CASCADE,
          friend_id TEXT NOT NULL,
          PRIMARY KEY (item_id, friend_id)
        );
        CREATE TABLE IF NOT EXISTS groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS group_members (
          group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
          friend_id TEXT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
          PRIMARY KEY (group_id, friend_id)
        );
        CREATE TABLE IF NOT EXISTS bill_friend_totals (
          bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
          friend_id TEXT NOT NULL,
          item_total REAL NOT NULL,
          tip_total REAL NOT NULL,
          total REAL NOT NULL,
          PRIMARY KEY (bill_id, friend_id)
        );
      `);
      return db;
    });
  }
  return dbPromise;
}

// ---- Friends ----

export async function listFriends(): Promise<Friend[]> {
  const db = await getDb();
  return db.getAllAsync<Friend>('SELECT id, name FROM friends ORDER BY name COLLATE NOCASE');
}

export async function addFriend(name: string): Promise<Friend> {
  const db = await getDb();
  const id = generateId();
  const trimmed = name.trim();
  await db.runAsync('INSERT INTO friends (id, name) VALUES (?, ?)', id, trimmed);
  return { id, name: trimmed };
}

export async function updateFriend(id: string, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE friends SET name = ? WHERE id = ?', name.trim(), id);
}

export async function deleteFriend(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM friends WHERE id = ?', id);
}

// ---- Groups ----

export interface Group {
  id: string;
  name: string;
  memberIds: string[];
}

export async function listGroups(): Promise<Group[]> {
  const db = await getDb();
  const groups = await db.getAllAsync<{ id: string; name: string }>(
    'SELECT id, name FROM groups ORDER BY name COLLATE NOCASE'
  );
  const members = await db.getAllAsync<{ group_id: string; friend_id: string }>(
    'SELECT group_id, friend_id FROM group_members'
  );
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    memberIds: members.filter((m) => m.group_id === group.id).map((m) => m.friend_id),
  }));
}

export interface SaveGroupInput {
  id?: string;
  name: string;
  memberIds: string[];
}

export async function saveGroup(input: SaveGroupInput): Promise<string> {
  const db = await getDb();
  const id = input.id ?? generateId();
  const trimmedName = input.name.trim();

  await db.withTransactionAsync(async () => {
    if (input.id) {
      await db.runAsync('UPDATE groups SET name = ? WHERE id = ?', trimmedName, id);
      await db.runAsync('DELETE FROM group_members WHERE group_id = ?', id);
    } else {
      await db.runAsync('INSERT INTO groups (id, name) VALUES (?, ?)', id, trimmedName);
    }
    for (const friendId of input.memberIds) {
      await db.runAsync('INSERT INTO group_members (group_id, friend_id) VALUES (?, ?)', id, friendId);
    }
  });

  return id;
}

export async function deleteGroup(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM groups WHERE id = ?', id);
}

// ---- Bills ----

export interface SaveBillItemInput {
  name: string;
  qty: number;
  unitPrice: number;
  /** One entry per unit (length === qty) — who's sharing that specific unit. */
  unitAssignments: string[][];
}

export interface SaveBillInput {
  date: string;
  merchant: string | null;
  subtotal: number;
  discountPercent?: number | null;
  discountAmount?: number | null;
  taxPercent?: number | null;
  taxAmount?: number | null;
  tipAmount?: number;
  tipSplitMode?: TipSplitMode;
  tipEligibleFriendIds?: string[];
  friendIds: string[];
  items: SaveBillItemInput[];
}

export async function saveBill(input: SaveBillInput): Promise<string> {
  const db = await getDb();
  const billId = generateId();

  // Each unit of a multi-quantity item (e.g. 3 bottles of water) is persisted as its own
  // bill_items row with its own assignments, since units can go to different people — see
  // expandItemsToUnits for why this must stay identical to the split shown on-screen.
  const units = expandItemsToUnits(
    input.items.map((item, index) => ({ id: String(index), name: item.name, unitPrice: item.unitPrice, qty: item.qty, unitAssignments: item.unitAssignments }))
  ).map((unit) => ({ ...unit, id: generateId() }));

  const split = computeBillSplit({
    items: units.map((unit) => ({ id: unit.id, unitPrice: unit.unitPrice, qty: 1, assignedFriendIds: unit.assignedFriendIds })),
    subtotal: input.subtotal,
    discountPercent: input.discountPercent,
    discountAmount: input.discountAmount,
    taxPercent: input.taxPercent,
    taxAmount: input.taxAmount,
    tipAmount: input.tipAmount ?? 0,
    tipSplitMode: input.tipSplitMode ?? 'even',
    tipEligibleFriendIds: input.tipEligibleFriendIds,
    friendIds: input.friendIds,
  });

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO bills (id, date, merchant, subtotal, discount_percent, discount_amount, tax_percent, tax_amount, tip_amount, tip_split_mode, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      billId,
      input.date,
      input.merchant,
      input.subtotal,
      input.discountPercent ?? null,
      input.discountAmount ?? null,
      input.taxPercent ?? null,
      input.taxAmount ?? null,
      input.tipAmount ?? 0,
      input.tipSplitMode ?? 'even',
      split.grandTotal
    );

    for (const unit of units) {
      const result = split.items.find((i) => i.id === unit.id)!;
      await db.runAsync(
        'INSERT INTO bill_items (id, bill_id, name, qty, unit_price, final_price) VALUES (?, ?, ?, ?, ?, ?)',
        unit.id,
        billId,
        unit.name,
        1,
        unit.unitPrice,
        result.finalPrice
      );
      for (const friendId of unit.assignedFriendIds) {
        await db.runAsync('INSERT INTO item_assignments (item_id, friend_id) VALUES (?, ?)', unit.id, friendId);
      }
    }

    for (const friendId of input.friendIds) {
      await db.runAsync(
        'INSERT INTO bill_friend_totals (bill_id, friend_id, item_total, tip_total, total) VALUES (?, ?, ?, ?, ?)',
        billId,
        friendId,
        split.perFriendItemTotal[friendId] ?? 0,
        split.perFriendTip[friendId] ?? 0,
        split.perFriendTotal[friendId] ?? 0
      );
    }
  });

  return billId;
}

export interface BillSummary {
  id: string;
  date: string;
  merchant: string | null;
  total: number;
}

export async function listBills(): Promise<BillSummary[]> {
  const db = await getDb();
  return db.getAllAsync<BillSummary>('SELECT id, date, merchant, total FROM bills ORDER BY date DESC');
}

export interface FriendBalance {
  friendId: string;
  name: string;
  balance: number;
}

export async function getFriendBalances(): Promise<FriendBalance[]> {
  const db = await getDb();
  return db.getAllAsync<FriendBalance>(
    `SELECT f.id as friendId, f.name as name, COALESCE(SUM(t.total), 0) as balance
     FROM friends f
     LEFT JOIN bill_friend_totals t ON t.friend_id = f.id
     GROUP BY f.id, f.name
     ORDER BY f.name COLLATE NOCASE`
  );
}

