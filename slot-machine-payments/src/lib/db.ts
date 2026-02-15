/**
 * Database Layer — Transaction Persistence & Balance Management
 * 
 * Phase 1: In-memory store for local development
 * Phase 2: Swap to DynamoDB for production (same interface)
 * 
 * This abstraction ensures we can switch storage backends
 * without changing any business logic.
 * 
 * Key security properties:
 *  - All balance mutations are atomic
 *  - Transaction IDs are tracked to prevent double-crediting
 *  - Every balance change is logged with audit trail
 */

import { v4 as uuidv4 } from "uuid";

// ─── Types ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  balance: number;
  createdAt: number;
  updatedAt: number;
}

export type TransactionType = "SPIN_BET" | "SPIN_WIN" | "CREDIT_PURCHASE" | "REFUND";
export type TransactionStatus = "COMPLETED" | "PENDING" | "FAILED";

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;        // Positive = credit, negative = debit
  balanceBefore: number;
  balanceAfter: number;
  status: TransactionStatus;
  metadata: Record<string, string>;  // spinId, paymentId, etc.
  createdAt: number;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  externalPaymentId: string;   // Yoco checkout ID
  amount: number;              // Amount in cents
  currency: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
  webhookReceived: boolean;
  idempotencyKey: string;      // Prevents double-crediting
  createdAt: number;
  updatedAt: number;
}

// ─── In-Memory Store (Phase 1) ───────────────────────────────────────
// Will be replaced by DynamoDB in Phase 2.
// This simulates a database with the same API contract.

const users = new Map<string, User>();
const transactions: Transaction[] = [];
const payments = new Map<string, PaymentRecord>();
const processedIdempotencyKeys = new Set<string>();

// ─── User Operations ─────────────────────────────────────────────────

const INITIAL_BALANCE = 1000;

export async function getOrCreateUser(userId: string): Promise<User> {
  let user = users.get(userId);

  if (!user) {
    user = {
      id: userId,
      balance: INITIAL_BALANCE,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    users.set(userId, user);
  }

  return { ...user }; // Return copy to prevent mutation
}

export async function getUserBalance(userId: string): Promise<number> {
  const user = await getOrCreateUser(userId);
  return user.balance;
}

// ─── Balance Operations (Atomic) ──────────────────────────────────────

/**
 * Debit a user's balance (e.g., placing a bet).
 * Returns the transaction record or throws if insufficient funds.
 */
export async function debitBalance(
  userId: string,
  amount: number,
  type: TransactionType,
  metadata: Record<string, string> = {}
): Promise<Transaction> {
  if (amount <= 0) throw new Error("Debit amount must be positive");

  const user = users.get(userId);
  if (!user) throw new Error("User not found");
  if (user.balance < amount) throw new Error("Insufficient balance");

  const balanceBefore = user.balance;
  user.balance -= amount;
  user.updatedAt = Date.now();

  const tx: Transaction = {
    id: uuidv4(),
    userId,
    type,
    amount: -amount,
    balanceBefore,
    balanceAfter: user.balance,
    status: "COMPLETED",
    metadata,
    createdAt: Date.now(),
  };

  transactions.push(tx);
  return { ...tx };
}

/**
 * Credit a user's balance (e.g., winning a spin, purchasing credits).
 * Supports idempotency key to prevent double-crediting from webhooks.
 */
export async function creditBalance(
  userId: string,
  amount: number,
  type: TransactionType,
  metadata: Record<string, string> = {},
  idempotencyKey?: string
): Promise<Transaction> {
  if (amount <= 0) throw new Error("Credit amount must be positive");

  // ─── Idempotency Check (Critical for webhooks) ─────────────────
  if (idempotencyKey) {
    if (processedIdempotencyKeys.has(idempotencyKey)) {
      // Already processed — return existing transaction
      const existing = transactions.find(
        (t) => t.metadata.idempotencyKey === idempotencyKey
      );
      if (existing) return { ...existing };
      throw new Error("Idempotency key found but transaction missing");
    }
    processedIdempotencyKeys.add(idempotencyKey);
    metadata.idempotencyKey = idempotencyKey;
  }

  const user = users.get(userId);
  if (!user) throw new Error("User not found");

  const balanceBefore = user.balance;
  user.balance += amount;
  user.updatedAt = Date.now();

  const tx: Transaction = {
    id: uuidv4(),
    userId,
    type,
    amount: +amount,
    balanceBefore,
    balanceAfter: user.balance,
    status: "COMPLETED",
    metadata,
    createdAt: Date.now(),
  };

  transactions.push(tx);
  return { ...tx };
}

// ─── Transaction Queries ──────────────────────────────────────────────

export async function getTransactionHistory(
  userId: string,
  limit: number = 50
): Promise<Transaction[]> {
  return transactions
    .filter((t) => t.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((t) => ({ ...t }));
}

export async function getTransactionById(
  txId: string
): Promise<Transaction | null> {
  const tx = transactions.find((t) => t.id === txId);
  return tx ? { ...tx } : null;
}

// ─── Payment Record Operations ────────────────────────────────────────

export async function createPaymentRecord(
  record: Omit<PaymentRecord, "id" | "createdAt" | "updatedAt">
): Promise<PaymentRecord> {
  const payment: PaymentRecord = {
    ...record,
    id: uuidv4(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  payments.set(payment.id, payment);
  return { ...payment };
}

export async function getPaymentByExternalId(
  externalPaymentId: string
): Promise<PaymentRecord | null> {
  for (const payment of payments.values()) {
    if (payment.externalPaymentId === externalPaymentId) {
      return { ...payment };
    }
  }
  return null;
}

export async function updatePaymentStatus(
  paymentId: string,
  status: PaymentRecord["status"],
  webhookReceived: boolean = false
): Promise<PaymentRecord> {
  const payment = payments.get(paymentId);
  if (!payment) throw new Error("Payment record not found");

  payment.status = status;
  payment.webhookReceived = webhookReceived;
  payment.updatedAt = Date.now();

  return { ...payment };
}

/**
 * Check if a payment has already been processed (idempotency).
 * Prevents double-crediting from duplicate webhook deliveries.
 */
export async function isPaymentProcessed(
  idempotencyKey: string
): Promise<boolean> {
  return processedIdempotencyKeys.has(idempotencyKey);
}

// ─── Admin / Dashboard Queries ────────────────────────────────────────

export async function getAllTransactions(
  limit: number = 100
): Promise<Transaction[]> {
  return transactions
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((t) => ({ ...t }));
}

export async function getFailedPayments(): Promise<PaymentRecord[]> {
  const failed: PaymentRecord[] = [];
  for (const payment of payments.values()) {
    if (payment.status === "FAILED") {
      failed.push({ ...payment });
    }
  }
  return failed.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getPaymentStats(): Promise<{
  totalPayments: number;
  completedPayments: number;
  failedPayments: number;
  totalRevenue: number;
}> {
  let totalPayments = 0;
  let completedPayments = 0;
  let failedPayments = 0;
  let totalRevenue = 0;

  for (const payment of payments.values()) {
    totalPayments++;
    if (payment.status === "COMPLETED") {
      completedPayments++;
      totalRevenue += payment.amount;
    } else if (payment.status === "FAILED") {
      failedPayments++;
    }
  }

  return { totalPayments, completedPayments, failedPayments, totalRevenue };
}
