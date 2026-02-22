# 🎰 Slot Machine — Secure Payment Gateway Demo

A production-grade FinTech portfolio project demonstrating **payment gateway integration**, **server-side game logic**, **secure webhook handling**, and **transaction persistence**.

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         BROWSER                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Next.js App (React)                                   │  │
│  │  • Slot Machine UI                                     │  │
│  │  • Balance Display                                     │  │
│  │  • Transaction History                                 │  │
│  │  • Admin Dashboard                                     │  │
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
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Slot Engine   │  │  Payment     │  │  Database Layer  │   │
│  │ (crypto RNG)  │  │  (Yoco API)  │  │  (In-mem → DDB)  │  │
│  └──────────────┘  └──────┬───────┘  └──────────────────┘   │
└──────────────────────────┼───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    YOCO PAYMENT GATEWAY                       │
│                                                              │
│  Checkout API → Hosted Payment Page → Webhook callback       │
│  (sandbox: sk_test_...)                                      │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔒 Security Architecture

### Server-Side Game Logic (Anti-Cheat)
- **All spin outcomes** generated server-side using `crypto.randomInt()`
- Frontend NEVER determines results — only renders what the server returns
- Weighted probability distribution with configurable house edge
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

---

## 🗂 Project Structure

```
slot-machine-payments/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── spin/route.ts              # POST — Execute spin (server-side)
│   │   │   ├── balance/route.ts           # GET  — Query balance
│   │   │   ├── create-payment/route.ts    # POST — Initiate Yoco checkout
│   │   │   ├── payment-webhook/route.ts   # POST — Yoco webhook receiver
│   │   │   └── transactions/route.ts      # GET  — Transaction history
│   │   ├── components/
│   │   │   └── SlotMachine.tsx            # Main game UI component
│   │   ├── transactions/page.tsx          # Transaction history page
│   │   ├── admin/page.tsx                 # Admin dashboard
│   │   ├── payment/
│   │   │   ├── success/page.tsx           # Payment success redirect
│   │   │   ├── cancel/page.tsx            # Payment cancel redirect
│   │   │   └── failure/page.tsx           # Payment failure redirect
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   └── lib/
│       ├── slot-engine.ts                 # Crypto-random slot machine core
│       ├── payment.ts                     # Yoco Checkout API integration
│       └── db.ts                          # Transaction persistence layer
├── .env.local                             # API keys (gitignored)
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
- [x] Success/Cancel/Failure redirect pages

### Phase 3 — Admin & Monitoring ✅
- [x] Admin dashboard with payment stats
- [x] All-transaction view (cross-user)
- [x] Webhook event log viewer
- [x] Failed payment monitor
- [x] Payment success rate metrics

---

## 🛡 Threat Model

| Threat | Mitigation |
|--------|-----------|
| Client manipulates spin result | Outcome generated server-side only; client receives result after computation |
| Replay attack on spin endpoint | Each spin deducts balance atomically; insufficient funds = rejected |
| Duplicate webhook fires | Idempotency key prevents double-crediting; processed keys tracked in set |
| Webhook spoofing | Payload structure validation; event type whitelist; amount cross-check |
| Balance manipulation via DevTools | Balance is server-authoritative; UI reads from API, never writes |
| Race condition on balance | Atomic debit-before-spin pattern; credit only after validation |
| Payment amount tampering | Server-side amount validation against stored payment record |

---

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open in browser
http://localhost:3000
```

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
YOCO_SECRET_KEY=sk_test_4a04b584ZapED6ef74b45fa97c68
YOCO_PUBLIC_KEY=pk_test_c50985d3ZB1EqK331f94
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### Available Routes

| Route | Description |
|-------|------------|
| `/` | Slot machine game |
| `/transactions` | User transaction history |
| `/admin` | Admin dashboard (payments, webhooks, failures) |
| `/payment/success` | Post-payment success page |
| `/payment/cancel` | Post-payment cancellation page |
| `/payment/failure` | Post-payment failure page |

---

## 🔧 Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS 4
- **Payment**: Yoco Checkout API (ZAR)
- **Randomness**: Node.js `crypto.randomInt()` (CSPRNG)
- **Database**: In-memory store (Phase 1) → DynamoDB (Phase 2)

---

## 📈 Future Enhancements

- [ ] DynamoDB integration for persistent storage
- [ ] User authentication (NextAuth.js)
- [ ] Rate limiting on spin endpoint
- [ ] WebSocket for real-time balance updates
- [ ] Jackpot pool system (progressive)
- [ ] Responsible gaming controls (daily limits)

---

*Built by Mfundo — demonstrating FinTech architecture, payment security, and production-ready engineering.*
