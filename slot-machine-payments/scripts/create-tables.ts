/**
 * DynamoDB Table Provisioning Script
 * 
 * Creates all required DynamoDB tables for the slot machine app.
 * Run once per environment: npx ts-node scripts/create-tables.ts
 * 
 * Tables:
 *  - slot-users: User accounts & balances
 *  - slot-transactions: All balance mutations (spins, purchases, refunds)
 *  - slot-payments: Yoco payment lifecycle records
 *  - slot-idempotency: Webhook idempotency keys
 *  - slot-audit: Full audit trail for compliance & monitoring
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  type CreateTableCommandInput,
} from "@aws-sdk/client-dynamodb";

const region = process.env.AWS_REGION || "af-south-1";
const client = new DynamoDBClient({ region });

const TABLE_DEFINITIONS: CreateTableCommandInput[] = [
  // ─── Users Table ────────────────────────────────────────────────
  {
    TableName: process.env.DYNAMODB_USERS_TABLE || "slot-users",
    KeySchema: [
      { AttributeName: "id", KeyType: "HASH" },
    ],
    AttributeDefinitions: [
      { AttributeName: "id", AttributeType: "S" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  },

  // ─── Transactions Table ─────────────────────────────────────────
  {
    TableName: process.env.DYNAMODB_TRANSACTIONS_TABLE || "slot-transactions",
    KeySchema: [
      { AttributeName: "userId", KeyType: "HASH" },
      { AttributeName: "sortKey", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      { AttributeName: "userId", AttributeType: "S" },
      { AttributeName: "sortKey", AttributeType: "S" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  },

  // ─── Payments Table ─────────────────────────────────────────────
  {
    TableName: process.env.DYNAMODB_PAYMENTS_TABLE || "slot-payments",
    KeySchema: [
      { AttributeName: "id", KeyType: "HASH" },
    ],
    AttributeDefinitions: [
      { AttributeName: "id", AttributeType: "S" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  },

  // ─── Idempotency Table ──────────────────────────────────────────
  {
    TableName: process.env.DYNAMODB_IDEMPOTENCY_TABLE || "slot-idempotency",
    KeySchema: [
      { AttributeName: "id", KeyType: "HASH" },
    ],
    AttributeDefinitions: [
      { AttributeName: "id", AttributeType: "S" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  },

  // ─── Audit Log Table ───────────────────────────────────────────
  {
    TableName: process.env.DYNAMODB_AUDIT_TABLE || "slot-audit",
    KeySchema: [
      { AttributeName: "action", KeyType: "HASH" },
      { AttributeName: "sortKey", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      { AttributeName: "action", AttributeType: "S" },
      { AttributeName: "sortKey", AttributeType: "S" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  },
];

async function tableExists(tableName: string): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name: string }).name === "ResourceNotFoundException"
    ) {
      return false;
    }
    throw error;
  }
}

async function createTables() {
  console.log(`\n🗄️  DynamoDB Table Provisioning — Region: ${region}\n`);

  for (const tableDef of TABLE_DEFINITIONS) {
    const name = tableDef.TableName!;

    if (await tableExists(name)) {
      console.log(`  ✅ ${name} — already exists`);
      continue;
    }

    try {
      await client.send(new CreateTableCommand(tableDef));
      console.log(`  🆕 ${name} — created (PAY_PER_REQUEST)`);
    } catch (error) {
      console.error(`  ❌ ${name} — FAILED:`, error);
    }
  }

  console.log("\n✨ Done!\n");
}

createTables().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
