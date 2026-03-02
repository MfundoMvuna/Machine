/**
 * CloudWatch Metrics Module
 * 
 * Pushes custom application metrics to AWS CloudWatch for monitoring
 * and Grafana Cloud visualization.
 * 
 * Metrics Published:
 *  - SlotMachine/Spins — Total spin count
 *  - SlotMachine/Wins — Win count
 *  - SlotMachine/WinAmount — Credits paid out
 *  - SlotMachine/BetAmount — Credits wagered
 *  - SlotMachine/Jackpots — Jackpot hits
 *  - SlotMachine/Revenue — Payment revenue (cents)
 *  - SlotMachine/ActiveUsers — Unique user actions
 *  - SlotMachine/WebhooksReceived — Webhook events
 *  - SlotMachine/Errors — Application errors
 * 
 * Metrics are batched and flushed every 60 seconds to minimize API calls.
 * Falls back to console logging when CloudWatch is not configured.
 */

import {
  CloudWatchClient,
  PutMetricDataCommand,
  type MetricDatum,
} from "@aws-sdk/client-cloudwatch";

// ─── Configuration ────────────────────────────────────────────────────

const NAMESPACE = "SlotMachine";
const FLUSH_INTERVAL_MS = 60_000; // 1 minute
const MAX_BATCH_SIZE = 20; // CloudWatch limit per PutMetricData call

const cloudwatchEnabled = process.env.CLOUDWATCH_ENABLED !== "false"; // enabled by default if AWS is configured
const region = process.env.AWS_REGION || "af-south-1";

let cwClient: CloudWatchClient | null = null;

function getClient(): CloudWatchClient | null {
  if (!cloudwatchEnabled) return null;

  if (!cwClient) {
    try {
      cwClient = new CloudWatchClient({ region });
    } catch {
      console.warn("[Metrics] CloudWatch client initialization failed — metrics will be logged only");
      return null;
    }
  }

  return cwClient;
}

// ─── Metric Buffer ────────────────────────────────────────────────────

const metricBuffer: MetricDatum[] = [];
let flushTimer: NodeJS.Timeout | null = null;

function ensureFlushTimer() {
  if (flushTimer) return;

  flushTimer = setInterval(async () => {
    await flushMetrics();
  }, FLUSH_INTERVAL_MS);

  // Don't block process exit
  if (flushTimer.unref) {
    flushTimer.unref();
  }
}

async function flushMetrics(): Promise<void> {
  if (metricBuffer.length === 0) return;

  const client = getClient();
  const batch = metricBuffer.splice(0, MAX_BATCH_SIZE);

  if (!client) {
    // Log metrics to console when CloudWatch is not available
    for (const metric of batch) {
      console.log(
        `[Metrics] ${metric.MetricName}: ${metric.Value} ${metric.Unit || "None"}`
      );
    }
    return;
  }

  try {
    await client.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: batch,
      })
    );
  } catch (error) {
    console.error("[Metrics] Failed to push to CloudWatch:", error);
    // Re-queue failed metrics (up to a limit)
    if (metricBuffer.length < 200) {
      metricBuffer.push(...batch);
    }
  }
}

// ─── Core Metric Recording ───────────────────────────────────────────

function recordMetric(
  name: string,
  value: number,
  unit: "Count" | "None" | "Milliseconds" = "Count",
  dimensions?: Record<string, string>
): void {
  const datum: MetricDatum = {
    MetricName: name,
    Value: value,
    Unit: unit,
    Timestamp: new Date(),
    Dimensions: dimensions
      ? Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value }))
      : undefined,
  };

  metricBuffer.push(datum);
  ensureFlushTimer();
}

// ─── Public Metric Functions ──────────────────────────────────────────

export function recordSpin(userId: string, betAmount: number): void {
  recordMetric("Spins", 1);
  recordMetric("BetAmount", betAmount);
  recordMetric("ActiveUsers", 1, "Count", { UserId: userId.slice(0, 32) });
}

export function recordWin(multiplier: number, winAmount: number, isJackpot: boolean): void {
  recordMetric("Wins", 1);
  recordMetric("WinAmount", winAmount);
  recordMetric("Multiplier", multiplier, "None");

  if (isJackpot) {
    recordMetric("Jackpots", 1);
  }
}

export function recordLoss(): void {
  recordMetric("Losses", 1);
}

export function recordPaymentCreated(amountCents: number): void {
  recordMetric("PaymentsCreated", 1);
  recordMetric("PaymentAmount", amountCents, "None");
}

export function recordPaymentCompleted(amountCents: number): void {
  recordMetric("PaymentsCompleted", 1);
  recordMetric("Revenue", amountCents, "None");
}

export function recordPaymentFailed(): void {
  recordMetric("PaymentsFailed", 1);
}

export function recordWebhook(eventType: string, status: "processed" | "rejected" | "duplicate"): void {
  recordMetric("WebhooksReceived", 1);
  recordMetric("WebhookStatus", 1, "Count", { EventType: eventType, Status: status });
}

export function recordError(source: string): void {
  recordMetric("Errors", 1, "Count", { Source: source });
}

export function recordLatency(operation: string, durationMs: number): void {
  recordMetric("Latency", durationMs, "Milliseconds", { Operation: operation });
}

export function recordUserRegistration(): void {
  recordMetric("UserRegistrations", 1);
}

// ─── Manual Flush (for shutdown) ──────────────────────────────────────

export async function shutdown(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flushMetrics();
}
