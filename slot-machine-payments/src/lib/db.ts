import { v4 as uuidv4 } from "uuid";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

export interface User {
  id: string;
  balance: number;
  profileName: string | null;
  profileEmail: string | null;
  createdAt: number;
  updatedAt: number;
}

export type TransactionType = "SPIN_BET" | "SPIN_WIN" | "CREDIT_PURCHASE" | "REFUND";
export type TransactionStatus = "COMPLETED" | "PENDING" | "FAILED";

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  status: TransactionStatus;
  metadata: Record<string, string>;
  createdAt: number;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  externalPaymentId: string;
  amount: number;
  currency: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
  webhookReceived: boolean;
  idempotencyKey: string;
  createdAt: number;
  updatedAt: number;
}

interface IdempotencyRecord {
  id: string;
  status: "RESERVED" | "COMPLETED";
  transactionId?: string;
  createdAt: number;
  updatedAt: number;
}

const users = new Map<string, User>();
const transactions: Transaction[] = [];
const payments = new Map<string, PaymentRecord>();
const processedIdempotencyKeys = new Set<string>();

const INITIAL_BALANCE = 1000;

const dynamoEnabled = process.env.DYNAMODB_ENABLED === "true";
const dynamoRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;

const tables = {
  users: process.env.DYNAMODB_USERS_TABLE || "slot-users",
  transactions: process.env.DYNAMODB_TRANSACTIONS_TABLE || "slot-transactions",
  payments: process.env.DYNAMODB_PAYMENTS_TABLE || "slot-payments",
  idempotency: process.env.DYNAMODB_IDEMPOTENCY_TABLE || "slot-idempotency",
};

let docClient: DynamoDBDocumentClient | null = null;

function isDynamoConfigured(): boolean {
  return Boolean(dynamoEnabled && dynamoRegion);
}

function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    if (!dynamoRegion) {
      throw new Error("AWS region not configured for DynamoDB");
    }
    const client = new DynamoDBClient({ region: dynamoRegion });
    docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

function isConditionalCheckFailed(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === "ConditionalCheckFailedException"
  );
}

function toTransaction(input: Record<string, unknown>): Transaction {
  return {
    id: String(input.id),
    userId: String(input.userId),
    type: input.type as TransactionType,
    amount: Number(input.amount),
    balanceBefore: Number(input.balanceBefore),
    balanceAfter: Number(input.balanceAfter),
    status: input.status as TransactionStatus,
    metadata: (input.metadata as Record<string, string>) || {},
    createdAt: Number(input.createdAt),
  };
}

function txSortKey(createdAt: number, id: string): string {
  return `${String(createdAt).padStart(16, "0")}#${id}`;
}

async function getIdempotencyRecord(idempotencyKey: string): Promise<IdempotencyRecord | null> {
  const client = getDocClient();
  const result = await client.send(
    new GetCommand({
      TableName: tables.idempotency,
      Key: { id: idempotencyKey },
    })
  );

  if (!result.Item) {
    return null;
  }

  return {
    id: String(result.Item.id),
    status: result.Item.status as IdempotencyRecord["status"],
    transactionId: result.Item.transactionId ? String(result.Item.transactionId) : undefined,
    createdAt: Number(result.Item.createdAt),
    updatedAt: Number(result.Item.updatedAt),
  };
}

async function saveTransactionDynamo(tx: Transaction): Promise<void> {
  const client = getDocClient();
  await client.send(
    new PutCommand({
      TableName: tables.transactions,
      Item: {
        sortKey: txSortKey(tx.createdAt, tx.id),
        ...tx,
      },
    })
  );
}

async function findTransactionByIdDynamo(txId: string): Promise<Transaction | null> {
  const client = getDocClient();
  const result = await client.send(
    new ScanCommand({
      TableName: tables.transactions,
      FilterExpression: "id = :txId",
      ExpressionAttributeValues: {
        ":txId": txId,
      },
      Limit: 1,
    })
  );

  const first = result.Items?.[0];
  return first ? toTransaction(first as Record<string, unknown>) : null;
}

async function findTransactionByIdempotencyDynamo(idempotencyKey: string): Promise<Transaction | null> {
  const client = getDocClient();
  const result = await client.send(
    new ScanCommand({
      TableName: tables.transactions,
      FilterExpression: "metadata.idempotencyKey = :key",
      ExpressionAttributeValues: {
        ":key": idempotencyKey,
      },
      Limit: 1,
    })
  );

  const first = result.Items?.[0];
  return first ? toTransaction(first as Record<string, unknown>) : null;
}

export async function getOrCreateUser(userId: string): Promise<User> {
  if (!isDynamoConfigured()) {
    let user = users.get(userId);

    if (!user) {
      user = {
        id: userId,
        balance: INITIAL_BALANCE,
        profileName: null,
        profileEmail: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      users.set(userId, user);
    }

    return { ...user };
  }

  const client = getDocClient();
  const existing = await client.send(
    new GetCommand({
      TableName: tables.users,
      Key: { id: userId },
    })
  );

  if (existing.Item) {
    return {
      id: String(existing.Item.id),
      balance: Number(existing.Item.balance),
      profileName: (existing.Item.profileName as string | null) ?? null,
      profileEmail: (existing.Item.profileEmail as string | null) ?? null,
      createdAt: Number(existing.Item.createdAt),
      updatedAt: Number(existing.Item.updatedAt),
    };
  }

  const now = Date.now();
  const created: User = {
    id: userId,
    balance: INITIAL_BALANCE,
    profileName: null,
    profileEmail: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await client.send(
      new PutCommand({
        TableName: tables.users,
        Item: created,
        ConditionExpression: "attribute_not_exists(id)",
      })
    );
    return created;
  } catch (error) {
    if (!isConditionalCheckFailed(error)) {
      throw error;
    }
    const retry = await client.send(
      new GetCommand({
        TableName: tables.users,
        Key: { id: userId },
      })
    );

    if (!retry.Item) {
      throw new Error("Failed to create user");
    }

    return {
      id: String(retry.Item.id),
      balance: Number(retry.Item.balance),
      profileName: (retry.Item.profileName as string | null) ?? null,
      profileEmail: (retry.Item.profileEmail as string | null) ?? null,
      createdAt: Number(retry.Item.createdAt),
      updatedAt: Number(retry.Item.updatedAt),
    };
  }
}

export async function getUserBalance(userId: string): Promise<number> {
  const user = await getOrCreateUser(userId);
  return user.balance;
}

export async function getUserProfile(userId: string): Promise<{
  userId: string;
  profileName: string | null;
  profileEmail: string | null;
}> {
  const user = await getOrCreateUser(userId);
  return {
    userId: user.id,
    profileName: user.profileName,
    profileEmail: user.profileEmail,
  };
}

export async function updateUserProfile(
  userId: string,
  profile: { profileName?: string; profileEmail?: string }
): Promise<User> {
  if (!isDynamoConfigured()) {
    const user = users.get(userId);
    if (!user) throw new Error("User not found");

    if (profile.profileName !== undefined) {
      const normalizedName = profile.profileName.trim();
      user.profileName = normalizedName.length > 0 ? normalizedName : null;
    }

    if (profile.profileEmail !== undefined) {
      const normalizedEmail = profile.profileEmail.trim().toLowerCase();
      user.profileEmail = normalizedEmail.length > 0 ? normalizedEmail : null;
    }

    user.updatedAt = Date.now();
    return { ...user };
  }

  await getOrCreateUser(userId);

  const normalizedName =
    profile.profileName !== undefined
      ? profile.profileName.trim() || null
      : undefined;
  const normalizedEmail =
    profile.profileEmail !== undefined
      ? profile.profileEmail.trim().toLowerCase() || null
      : undefined;

  const updates: string[] = ["updatedAt = :updatedAt"];
  const values: Record<string, unknown> = { ":updatedAt": Date.now() };

  if (normalizedName !== undefined) {
    updates.push("profileName = :profileName");
    values[":profileName"] = normalizedName;
  }

  if (normalizedEmail !== undefined) {
    updates.push("profileEmail = :profileEmail");
    values[":profileEmail"] = normalizedEmail;
  }

  const client = getDocClient();
  const result = await client.send(
    new UpdateCommand({
      TableName: tables.users,
      Key: { id: userId },
      UpdateExpression: `SET ${updates.join(", ")}`,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    })
  );

  if (!result.Attributes) {
    throw new Error("Failed to update user profile");
  }

  return {
    id: String(result.Attributes.id),
    balance: Number(result.Attributes.balance),
    profileName: (result.Attributes.profileName as string | null) ?? null,
    profileEmail: (result.Attributes.profileEmail as string | null) ?? null,
    createdAt: Number(result.Attributes.createdAt),
    updatedAt: Number(result.Attributes.updatedAt),
  };
}

export async function debitBalance(
  userId: string,
  amount: number,
  type: TransactionType,
  metadata: Record<string, string> = {}
): Promise<Transaction> {
  if (amount <= 0) throw new Error("Debit amount must be positive");

  if (!isDynamoConfigured()) {
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

  await getOrCreateUser(userId);

  const client = getDocClient();
  const now = Date.now();
  const txId = uuidv4();

  try {
    const updateResult = await client.send(
      new UpdateCommand({
        TableName: tables.users,
        Key: { id: userId },
        UpdateExpression: "SET balance = balance - :amount, updatedAt = :updatedAt",
        ConditionExpression: "balance >= :amount",
        ExpressionAttributeValues: {
          ":amount": amount,
          ":updatedAt": now,
        },
        ReturnValues: "ALL_OLD",
      })
    );

    const oldBalance = Number(updateResult.Attributes?.balance ?? 0);

    const tx: Transaction = {
      id: txId,
      userId,
      type,
      amount: -amount,
      balanceBefore: oldBalance,
      balanceAfter: oldBalance - amount,
      status: "COMPLETED",
      metadata,
      createdAt: now,
    };

    await saveTransactionDynamo(tx);
    return tx;
  } catch (error) {
    if (!isConditionalCheckFailed(error)) {
      throw error;
    }

    const user = await getOrCreateUser(userId);
    if (user.balance < amount) {
      throw new Error("Insufficient balance");
    }
    throw new Error("Debit failed");
  }
}

export async function creditBalance(
  userId: string,
  amount: number,
  type: TransactionType,
  metadata: Record<string, string> = {},
  idempotencyKey?: string
): Promise<Transaction> {
  if (amount <= 0) throw new Error("Credit amount must be positive");

  if (!isDynamoConfigured()) {
    if (idempotencyKey) {
      if (processedIdempotencyKeys.has(idempotencyKey)) {
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

  await getOrCreateUser(userId);

  const client = getDocClient();
  const now = Date.now();

  if (idempotencyKey) {
    try {
      await client.send(
        new PutCommand({
          TableName: tables.idempotency,
          Item: {
            id: idempotencyKey,
            status: "RESERVED",
            createdAt: now,
            updatedAt: now,
          } satisfies IdempotencyRecord,
          ConditionExpression: "attribute_not_exists(id)",
        })
      );
    } catch (error) {
      if (!isConditionalCheckFailed(error)) {
        throw error;
      }

      const existing = await getIdempotencyRecord(idempotencyKey);
      if (existing?.status === "COMPLETED" && existing.transactionId) {
        const existingTx = await findTransactionByIdDynamo(existing.transactionId);
        if (existingTx) {
          return existingTx;
        }
      }

      const txByMetadata = await findTransactionByIdempotencyDynamo(idempotencyKey);
      if (txByMetadata) {
        return txByMetadata;
      }

      throw new Error("Payment already processed");
    }

    metadata.idempotencyKey = idempotencyKey;
  }

  const updateResult = await client.send(
    new UpdateCommand({
      TableName: tables.users,
      Key: { id: userId },
      UpdateExpression: "SET balance = balance + :amount, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":amount": amount,
        ":updatedAt": now,
      },
      ReturnValues: "ALL_OLD",
    })
  );

  const oldBalance = Number(updateResult.Attributes?.balance ?? 0);

  const tx: Transaction = {
    id: uuidv4(),
    userId,
    type,
    amount,
    balanceBefore: oldBalance,
    balanceAfter: oldBalance + amount,
    status: "COMPLETED",
    metadata,
    createdAt: now,
  };

  await saveTransactionDynamo(tx);

  if (idempotencyKey) {
    await client.send(
      new UpdateCommand({
        TableName: tables.idempotency,
        Key: { id: idempotencyKey },
        UpdateExpression: "SET #status = :status, transactionId = :transactionId, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": "COMPLETED",
          ":transactionId": tx.id,
          ":updatedAt": Date.now(),
        },
      })
    );
  }

  return tx;
}

export async function getTransactionHistory(
  userId: string,
  limit: number = 50
): Promise<Transaction[]> {
  if (!isDynamoConfigured()) {
    return transactions
      .filter((t) => t.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((t) => ({ ...t }));
  }

  const client = getDocClient();
  const result = await client.send(
    new QueryCommand({
      TableName: tables.transactions,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
      ScanIndexForward: false,
      Limit: limit,
    })
  );

  return (result.Items || []).map((item: Record<string, unknown>) =>
    toTransaction(item)
  );
}

export async function getTransactionById(
  txId: string
): Promise<Transaction | null> {
  if (!isDynamoConfigured()) {
    const tx = transactions.find((t) => t.id === txId);
    return tx ? { ...tx } : null;
  }

  return findTransactionByIdDynamo(txId);
}

export async function createPaymentRecord(
  record: Omit<PaymentRecord, "id" | "createdAt" | "updatedAt">
): Promise<PaymentRecord> {
  const payment: PaymentRecord = {
    ...record,
    id: uuidv4(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  if (!isDynamoConfigured()) {
    payments.set(payment.id, payment);
    return { ...payment };
  }

  const client = getDocClient();
  await client.send(
    new PutCommand({
      TableName: tables.payments,
      Item: payment,
    })
  );

  return payment;
}

export async function getPaymentByExternalId(
  externalPaymentId: string
): Promise<PaymentRecord | null> {
  if (!isDynamoConfigured()) {
    for (const payment of payments.values()) {
      if (payment.externalPaymentId === externalPaymentId) {
        return { ...payment };
      }
    }
    return null;
  }

  const client = getDocClient();
  const result = await client.send(
    new ScanCommand({
      TableName: tables.payments,
      FilterExpression: "externalPaymentId = :externalPaymentId",
      ExpressionAttributeValues: {
        ":externalPaymentId": externalPaymentId,
      },
      Limit: 1,
    })
  );

  const first = result.Items?.[0] as PaymentRecord | undefined;
  return first ? { ...first } : null;
}

export async function updatePaymentStatus(
  paymentId: string,
  status: PaymentRecord["status"],
  webhookReceived: boolean = false
): Promise<PaymentRecord> {
  if (!isDynamoConfigured()) {
    const payment = payments.get(paymentId);
    if (!payment) throw new Error("Payment record not found");

    payment.status = status;
    payment.webhookReceived = webhookReceived;
    payment.updatedAt = Date.now();

    return { ...payment };
  }

  const client = getDocClient();
  const result = await client.send(
    new UpdateCommand({
      TableName: tables.payments,
      Key: { id: paymentId },
      UpdateExpression: "SET #status = :status, webhookReceived = :webhookReceived, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": status,
        ":webhookReceived": webhookReceived,
        ":updatedAt": Date.now(),
      },
      ReturnValues: "ALL_NEW",
    })
  );

  if (!result.Attributes) {
    throw new Error("Payment record not found");
  }

  return result.Attributes as PaymentRecord;
}

export async function isPaymentProcessed(
  idempotencyKey: string
): Promise<boolean> {
  if (!isDynamoConfigured()) {
    return processedIdempotencyKeys.has(idempotencyKey);
  }

  const existing = await getIdempotencyRecord(idempotencyKey);
  return existing?.status === "COMPLETED";
}

export async function getAllTransactions(
  limit: number = 100
): Promise<Transaction[]> {
  if (!isDynamoConfigured()) {
    return transactions
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((t) => ({ ...t }));
  }

  const client = getDocClient();
  const result = await client.send(
    new ScanCommand({
      TableName: tables.transactions,
      Limit: limit,
    })
  );

  return (result.Items || [])
    .map((item: Record<string, unknown>) => toTransaction(item))
    .sort((a: Transaction, b: Transaction) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export async function getFailedPayments(): Promise<PaymentRecord[]> {
  if (!isDynamoConfigured()) {
    const failed: PaymentRecord[] = [];
    for (const payment of payments.values()) {
      if (payment.status === "FAILED") {
        failed.push({ ...payment });
      }
    }
    return failed.sort((a, b) => b.createdAt - a.createdAt);
  }

  const client = getDocClient();
  const result = await client.send(
    new ScanCommand({
      TableName: tables.payments,
      FilterExpression: "#status = :failed",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":failed": "FAILED",
      },
    })
  );

  return ((result.Items || []) as PaymentRecord[]).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getPaymentStats(): Promise<{
  totalPayments: number;
  completedPayments: number;
  failedPayments: number;
  totalRevenue: number;
}> {
  if (!isDynamoConfigured()) {
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

  const client = getDocClient();
  const result = await client.send(
    new ScanCommand({
      TableName: tables.payments,
    })
  );

  const allPayments = (result.Items || []) as PaymentRecord[];

  let totalPayments = 0;
  let completedPayments = 0;
  let failedPayments = 0;
  let totalRevenue = 0;

  for (const payment of allPayments) {
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
