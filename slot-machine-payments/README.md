# 🎰 Slot Machine — Secure Payment Gateway Demo

A production-grade FinTech portfolio project demonstrating **payment gateway integration**, **server-side game logic**, **secure webhook handling**, **transaction persistence**, and **real-time monitoring**.

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         BROWSER                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Next.js App (React)                                   │  │
│  │  • Slot Machine UI         • User Registration         │  │
│  │  • Balance Display         • Transaction History       │  │
│  │  • Admin Dashboard         • Game Config Controls      │  │
│  └──────────────┬─────────────────────────────────────────┘  │
└─────────────────┼────────────────────────────────────────────┘
                  │ HTTPS
                  ▼
┌──────────────────────────────────────────────────────────────┐
│                    NEXT.JS API ROUTES                         │
│                                                              │
│  POST /api/spin              ← Server-authoritative spin     │
│  POST /api/create-payment    ← Initiate Yoco checkout        │
│  POST /api/payment-webhook   ← Receive Yoco webhooks         │
│  GET  /api/balance           ← Query user balance            │
│  GET  /api/transactions      ← Transaction history           │
│  GET  /api/profile           ← User profile                  │
│  GET  /api/admin/settings    ← Game config (GET/POST/DELETE) │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Slot Engine   │  │  Payment     │  │  Database Layer  │   │
│  │ (crypto RNG)  │  │  (Yoco API)  │  │  (DynamoDB)      │   │
│  │ + Game Config │  │              │  │  + Audit Trail   │   │
│  └──────────────┘  └──────┬───────┘  └──────┬───────────┘   │
└──────────────────────────┼──────────────────┼────────────────┘
                           │                  │
                           ▼                  ▼
┌──────────────────────────────┐  ┌────────────────────────────┐
│    YOCO PAYMENT GATEWAY      │  │    AWS SERVICES            │
│                              │  │                            │
│  Checkout API → Hosted Page  │  │  DynamoDB (af-south-1)     │
│  → Webhook callback          │  │  CloudWatch Metrics        │
│  (sandbox: sk_test_...)      │  │  → Grafana Cloud           │
└──────────────────────────────┘  └────────────────────────────┘
```

---

## 🔒 Security Architecture

### Server-Side Game Logic (Anti-Cheat)
- **All spin outcomes** generated server-side using `crypto.randomInt()`
- Frontend NEVER determines results — only renders what the server returns
- Weighted probability distribution with configurable house edge
- Admin-tunable win-rate system (win rate, near-miss, loss-streak breaker)
- Every spin produces a unique `spinId` for audit trail

### Payment Security
- **Webhook signature verification** on incoming Yoco callbacks
- **Idempotent processing** — duplicate webhooks don't double-credit
- **Amount validation** — webhook amount checked against stored record
- **Debit-before-spin** — bet deducted BEFORE outcome is generated
- Secret keys stored in environment variables, never exposed to client

### Transaction Integrity
- Complete audit trail with `balanceBefore` / `balanceAfter` for every mutation
- All balance changes tracked with typed transactions (`SPIN_BET`, `SPIN_WIN`, `CREDIT_PURCHASE`)
- Payment records maintain full lifecycle (`PENDING` → `COMPLETED` / `FAILED`)
- Full audit log table for compliance (user actions, admin changes, webhook events)

---

## 🗂 Project Structure

```
slot-machine-payments/
├── docs/
│   └── GRAFANA_SETUP.md               # Grafana Cloud + CloudWatch setup guide
├── scripts/
│   └── create-tables.ts               # DynamoDB table provisioning script
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── admin/settings/route.ts # GET/POST/DELETE — Game config API
│   │   │   ├── spin/route.ts           # POST — Execute spin (server-side)
│   │   │   ├── balance/route.ts        # GET  — Query balance
│   │   │   ├── create-payment/route.ts # POST — Initiate Yoco checkout
│   │   │   ├── payment-webhook/route.ts# POST — Yoco webhook receiver
│   │   │   ├── profile/route.ts        # GET/POST — User profile
│   │   │   └── transactions/route.ts   # GET  — Transaction history
│   │   ├── components/
│   │   │   └── SlotMachine.tsx         # Main game UI component
│   │   ├── register/page.tsx           # User registration / profile page
│   │   ├── transactions/page.tsx       # Transaction history page
│   │   ├── admin/page.tsx              # Admin dashboard (stats + config)
│   │   ├── payment/
│   │   │   ├── cancel/page.tsx         # Payment cancel redirect
│   │   │   └── failure/page.tsx        # Payment failure redirect
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   └── lib/
│       ├── slot-engine.ts              # Crypto-random slot machine core
│       ├── game-config.ts              # Admin-tunable win-rate system
│       ├── payment.ts                  # Yoco Checkout API integration
│       ├── db.ts                       # DynamoDB persistence + audit trail
│       └── metrics.ts                  # CloudWatch metrics (batched)
├── .env.local                          # API keys (gitignored)
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🎮 Features

### Phase 1 — Game Engine ✅
- [x] Server-authoritative slot machine with crypto-random outcomes
- [x] Weighted symbol probability (configurable house edge)
- [x] Payout table: 3-of-a-kind + partial match payouts
- [x] Client-side reel animation with staggered stops
- [x] Real-time balance tracking
- [x] Bet amount selection (1, 5, 10, 25, 50, 100)
- [x] Transaction history with audit trail

### Phase 2 — Payment Integration ✅
- [x] Yoco Checkout API integration (South Africa)
- [x] Credit package system (500 / 1,000 / 2,500 / 5,000 credits)
- [x] Secure webhook handler with idempotency
- [x] Payment lifecycle tracking (PENDING → COMPLETED/FAILED)
- [x] Cancel/Failure redirect pages (success returns directly to game)

### Phase 3 — Admin & Monitoring ✅
- [x] Admin dashboard with payment stats and game config controls
- [x] All-transaction view (cross-user)
- [x] Webhook event log viewer
- [x] Failed payment monitor
- [x] Payment success rate metrics

### Phase 4 — Persistence & Observability ✅
- [x] DynamoDB integration for persistent storage (5 tables)
- [x] User registration & profile management
- [x] Admin-tunable game configuration (win rate, near-miss, loss-streak breaker)
- [x] CloudWatch custom metrics (spins, wins, revenue, errors, latency)
- [x] Grafana Cloud dashboard support (see `docs/GRAFANA_SETUP.md`)
- [x] Full audit trail for compliance and monitoring
- [x] Table provisioning script (`npm run db:create-tables`)

---

## 🛡 Threat Model

| Threat | Mitigation |
|--------|-----------|
| Client manipulates spin result | Outcome generated server-side only; client receives result after computation |
| Replay attack on spin endpoint | Each spin deducts balance atomically; insufficient funds = rejected |
| Duplicate webhook fires | Idempotency key prevents double-crediting; processed keys tracked in DynamoDB |
| Webhook spoofing | Payload structure validation; event type whitelist; amount cross-check |
| Balance manipulation via DevTools | Balance is server-authoritative; UI reads from API, never writes |
| Race condition on balance | Atomic debit-before-spin pattern; credit only after validation |
| Payment amount tampering | Server-side amount validation against stored payment record |

---

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Provision DynamoDB tables (one-time)
npm run db:create-tables

# Start development server
npm run dev

# Open in browser
http://localhost:3000
```

> **Note:** The first page load triggers a cold compile (~30 seconds with Turbopack). Subsequent loads are instant.

---

## 🔁 CI/CD (GitHub Actions)

This repo is configured with a GitHub Actions CI workflow:

- **CI** (`.github/workflows/ci.yml`)
    - Runs on PRs and pushes to `main`
    - Executes `npm ci`, `npm run lint`, and `npm run build`

### Notes

- Workflow is configured for this monorepo layout where app code lives in `slot-machine-payments/`.
- Deployment is handled directly by Vercel's native GitHub integration (auto-deploys on push to `main`).

### Environment Variables

Create `.env.local`:
```env
# Yoco Payment Gateway
YOCO_SECRET_KEY=sk_test_...
YOCO_PUBLIC_KEY=pk_test_...
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# AWS / DynamoDB
DYNAMODB_ENABLED=true
AWS_REGION=af-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
DYNAMODB_USERS_TABLE=slot-users
DYNAMODB_TRANSACTIONS_TABLE=slot-transactions
DYNAMODB_PAYMENTS_TABLE=slot-payments
DYNAMODB_IDEMPOTENCY_TABLE=slot-idempotency
DYNAMODB_AUDIT_TABLE=slot-audit

# CloudWatch Metrics (optional — defaults to enabled)
CLOUDWATCH_ENABLED=true
```

### DynamoDB Table Keys

| Table | Partition Key | Sort Key |
|-------|--------------|----------|
| `slot-users` | `id` (String) | — |
| `slot-transactions` | `userId` (String) | `sortKey` (String) |
| `slot-payments` | `id` (String) | — |
| `slot-idempotency` | `id` (String) | — |
| `slot-audit` | `id` (String) | — |

### Available Routes

| Route | Description |
|-------|------------|
| `/` | Slot machine game |
| `/register` | User registration / profile management |
| `/transactions` | User transaction history |
| `/admin` | Admin dashboard (payments, webhooks, game config) |
| `/payment/cancel` | Post-payment cancellation page |
| `/payment/failure` | Post-payment failure page |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/spin` | POST | Execute a spin (server-authoritative) |
| `/api/balance` | GET | Query user credit balance |
| `/api/create-payment` | POST | Initiate a Yoco checkout session |
| `/api/payment-webhook` | POST | Receive Yoco webhook callbacks |
| `/api/transactions` | GET | Fetch transaction history |
| `/api/profile` | GET/POST | Read/update user profile |
| `/api/admin/settings` | GET/POST/DELETE | Read/update/reset game configuration |

---

## 📊 Monitoring & Metrics

Metrics are pushed to **AWS CloudWatch** (namespace: `SlotMachine`) and can be visualized in **Grafana Cloud** (free tier).

| Metric | Unit | Description |
|--------|------|-------------|
| `Spins` | Count | Total spin count |
| `Wins` / `Losses` | Count | Winning / losing spins |
| `WinAmount` | None | Credits paid out per win |
| `BetAmount` | None | Credits wagered per spin |
| `Jackpots` | Count | Jackpot occurrences |
| `Revenue` | None | Payment revenue (cents ZAR) |
| `Errors` | Count | Application errors |
| `Latency` | Milliseconds | Operation duration |

Metrics are batched and flushed every 60 seconds. Set `CLOUDWATCH_ENABLED=false` to log metrics to the console instead.

See [docs/GRAFANA_SETUP.md](docs/GRAFANA_SETUP.md) for full Grafana Cloud dashboard setup instructions.

---

## 🔧 Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS 4
- **Payment**: Yoco Checkout API (ZAR)
- **Randomness**: Node.js `crypto.randomInt()` (CSPRNG)
- **Database**: AWS DynamoDB (af-south-1)
- **Monitoring**: AWS CloudWatch → Grafana Cloud
- **CI/CD**: GitHub Actions + Vercel

---

## 📈 Future Enhancements

- [x] DynamoDB integration for persistent storage
- [x] CloudWatch metrics + Grafana dashboards
- [x] Admin-tunable game configuration
- [x] User registration & profiles
- [ ] User authentication (NextAuth.js)
- [ ] Rate limiting on spin endpoint
- [ ] WebSocket for real-time balance updates
- [ ] Jackpot pool system (progressive)
- [ ] Responsible gaming controls (daily limits)

---

*Built by Mfundo — demonstrating FinTech architecture, payment security, and production-ready engineering.*
