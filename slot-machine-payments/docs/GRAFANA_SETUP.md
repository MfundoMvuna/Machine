# Grafana Cloud + CloudWatch Monitoring Setup

This guide connects the Slot Machine's CloudWatch metrics to a free Grafana Cloud dashboard for real-time monitoring.

---

## Architecture

```
┌─────────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Next.js App        │────▶│  AWS CloudWatch   │────▶│  Grafana Cloud   │
│  (src/lib/metrics)  │     │  (af-south-1)     │     │  (Free Tier)     │
│                     │     │                   │     │                  │
│  Batched metrics    │     │  Namespace:       │     │  Dashboards      │
│  flushed every 60s  │     │  "SlotMachine"    │     │  Alerts          │
└─────────────────────┘     └──────────────────┘     └──────────────────┘
```

## Metrics Published

| Metric | Unit | Description |
|--------|------|-------------|
| `Spins` | Count | Total spin count |
| `Wins` | Count | Winning spins |
| `Losses` | Count | Losing spins |
| `WinAmount` | None | Credits paid out per win |
| `BetAmount` | None | Credits wagered per spin |
| `Jackpots` | Count | Jackpot occurrences |
| `Revenue` | None | Payment revenue (cents ZAR) |
| `PaymentsCreated` | Count | Checkout sessions initiated |
| `PaymentsCompleted` | Count | Successful payments |
| `PaymentsFailed` | Count | Failed payments |
| `WebhooksReceived` | Count | Yoco webhook events |
| `UserRegistrations` | Count | New accounts created |
| `Errors` | Count | Application errors (by source) |
| `Latency` | Milliseconds | Operation duration (by operation) |

---

## Step 1: Grafana Cloud Account (Free)

1. Go to [grafana.com/cloud](https://grafana.com/cloud/) and sign up for a free account
2. Create a new stack (select a region close to you)
3. Note your Grafana Cloud URL (e.g., `https://your-stack.grafana.net`)

## Step 2: Add CloudWatch Data Source

1. In Grafana Cloud, go to **Connections → Data Sources → Add data source**
2. Search for **CloudWatch**
3. Configure:
   - **Authentication Provider**: Access & Secret Key
   - **Access Key ID**: `AKIAWIXPC34VIAIBAAHA`
   - **Secret Access Key**: *(your secret key)*
   - **Default Region**: `af-south-1`
4. Click **Save & Test**

## Step 3: Create Dashboard

### Import Quick Dashboard

1. Go to **Dashboards → New → Import**
2. Paste the JSON from `grafana-dashboard.json` (create one or build manually)

### Manual Dashboard Setup

Create these panels:

#### Panel 1: Spins per Minute
- Query: `SlotMachine` → `Spins` → Period: 1 minute → Stat: Sum
- Visualization: Time Series

#### Panel 2: Win Rate
- Query A: `SlotMachine` → `Wins` → Sum
- Query B: `SlotMachine` → `Spins` → Sum
- Expression: `A / B * 100`
- Visualization: Gauge (0-100%)

#### Panel 3: Revenue
- Query: `SlotMachine` → `Revenue` → Sum
- Visualization: Stat (with unit: ZAR cents)

#### Panel 4: Active Users
- Query: `SlotMachine` → `ActiveUsers` → Sum
- Visualization: Stat

#### Panel 5: Jackpots
- Query: `SlotMachine` → `Jackpots` → Sum
- Visualization: Stat (with color threshold: >0 = gold)

#### Panel 6: Error Rate
- Query: `SlotMachine` → `Errors` → Sum
- Visualization: Time Series (with alert threshold)

#### Panel 7: Spin Latency (p50/p95)
- Query: `SlotMachine` → `Latency` → Average / p95
- Filter: Operation = "spin"
- Visualization: Time Series

#### Panel 8: Payment Funnel
- Query A: `PaymentsCreated` → Sum
- Query B: `PaymentsCompleted` → Sum  
- Query C: `PaymentsFailed` → Sum
- Visualization: Bar Gauge

## Step 4: Alerts (Optional)

Set up alerts for critical conditions:

1. **High Error Rate**: `Errors > 10` in 5 minutes
2. **Payment Failures**: `PaymentsFailed > 3` in 10 minutes
3. **No Spins**: `Spins = 0` for 30 minutes (site may be down)
4. **High Latency**: `Latency p95 > 2000ms`

Configure notification channels (email, Slack, Discord) in **Alerting → Contact points**.

---

## Environment Variables

The metrics module uses the same AWS credentials as DynamoDB:

```env
# .env.local — already configured
AWS_REGION=af-south-1
AWS_ACCESS_KEY_ID=AKIAWIXPC34VIAIBAAHA
AWS_SECRET_ACCESS_KEY=<your-secret>

# Optional: disable metrics (defaults to enabled)
CLOUDWATCH_ENABLED=true
```

## Local Development

Metrics work in local dev too — they'll push to CloudWatch from your machine.
To disable during development, set `CLOUDWATCH_ENABLED=false` in `.env.local`.

## Cost

- **CloudWatch**: Free tier includes 10 custom metrics + 1M API requests/month
- **Grafana Cloud**: Free tier includes 10k metrics, 3 users, 14-day retention
- At typical usage, this setup costs **$0/month**
