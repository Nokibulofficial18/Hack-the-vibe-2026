# WeatherShield Bangladesh — Parametric Micro-Insurance Engine

> **Automated BDT (৳) climate risk protection for smallholder farmers in Bangladesh.** Built with Next.js 14 (App Router), TypeScript, Tailwind CSS, Prisma ORM, Supabase PostgreSQL, and the Open-Meteo Weather API.

---

## Overview

Traditional crop insurance relies on slow manual field inspections, delaying payouts for 3–6 months after haor flash floods, coastal cyclones, riverine floods, or Barind droughts. **WeatherShield** replaces manual loss verification with **parametric micro-insurance**: objective meteorological thresholds trigger automated, auditable **Bangladeshi Taka (৳ / BDT)** claim payouts in seconds.

### Key Capabilities
- **Role-Based Dual Views (Farmer & Risk Admin):** Instant header switcher between **Farmer** (`Rokon Uddin`, `Fatima Begum` — isolated strictly to owned plots, contracts, and payouts) and **Admin** (`Abdul Karim` — global portfolio risk analytics, A06 Fault Injector, A07 Workflow Runner, and one-click Demo Reset).
- **Bangladesh Farm & Policy Registry (`/farms`, `/policies`):** Climate-vulnerable Bangladesh district preset selector (**Sunamganj Haor**, **Satkhira Coastal**, **Rajshahi Barind Tract**, **Kurigram Riverine**, **Bogura**), GPS coordinate validation (`-90°` to `90°` lat, `-180°` to `180°` lon), land area in **Bigha** & **Acres**, and BDT micro-insurance policies (`৳5,000`–`৳50,000`+).
- **Weather Monitoring Engine (`/dashboard`):** Aggregate KPI cards (**Total Liability**, **Total Payouts Issued**, **Active Risk Exposure** in `৳`), live Open-Meteo telemetry sync (`Asia/Dhaka`), threshold progress bars, and breach alerts.
- **Claim & Payout Ledger (`/claims`):** Searchable, filterable (by Policy Status, Claim Status, and Metric), and dynamically sortable audit table with expandable 5-step `WorkflowLog` timelines and `idempotencyKey` locks.

---

## System Architecture

```text
+-----------------------------------------------------------------------+
|                           NEXT.JS CLIENT UI                           |
|  [ Overview ]  [ Farms & Policies ]  [ Weather Monitor ]  [ Claims ]  |
|        [ Farmer / Admin Role Switcher ]   [ Accessible Toasts ]       |
+-----------------------------------+-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                    NEXT.JS 14 APP ROUTER / API LAYER                  |
|                                                                       |
|  +------------------------+        +-------------------------------+  |
|  | RBAC & Resource Guard  |        | Validation & Payout Rules     |  |
|  | (lib/auth-server.ts)   |        | (lib/domain.ts)               |  |
|  +------------------------+        +-------------------------------+  |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  |            ADVANCED CHALLENGE A06: RESILIENCE PIPELINE          |  |
|  |                (lib/weatherResilience.ts, lib/cache.ts)         |  |
|  |  Rate Guard -> 3.5s AbortController -> 3x Backoff -> Cache DB   |  |
|  +-----------------------------------------------------------------+  |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  |           ADVANCED CHALLENGE A07: WORKFLOW STATE ENGINE         |  |
|  |                     (lib/workflowEngine.ts)                     |  |
|  |  1. Detect -> 2. Validate -> 3. Calc -> 4. Reserve -> 5. Pay    |  |
|  |     (Transactional Rollback + Direct Step 4 Resume + Idem Lock) |  |
|  +-----------------------------------------------------------------+  |
+-----------------------------------+-----------------------------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
            v                                               v
+-----------------------+                       +-----------------------+
|   EXTERNAL WEATHER    |                       |  SUPABASE POSTGRESQL  |
|   API (OPEN-METEO)    |                       |     (PRISMA ORM)      |
|  /v1/forecast         |                       | Users, Farms, Policies|
+-----------------------+                       | Claims, WorkflowLogs, |
                                                | WeatherCache          |
                                                +-----------------------+
```

---

## Tech Stack

- **Framework:** Next.js 14 (App Router, Server Components, Route Handlers)
- **Language:** TypeScript 5 (Strict mode)
- **Styling & Icons:** Tailwind CSS 3 + Lucide React
- **Database & ORM:** PostgreSQL (Supabase Session Pooler) via Prisma ORM 6
- **Weather Data:** Open-Meteo Forecast API (`https://api.open-meteo.com/v1/forecast`)

---

## Advanced Technical Challenges

### A06 — External API & Fault Tolerance (`lib/weatherResilience.ts`, `lib/cache.ts`)
- **Strict 3.5-Second Timeout:** Enforced per outbound request using `AbortController`.
- **Exponential Backoff Retries:** Up to 3 attempts with exponential delay + jitter (`2^attempt × 100ms + jitter`).
- **Payload Schema Guard:** Rejects corrupted/malformed JSON responses before any cache write so `WeatherCache` is never poisoned.
- **Automatic Cache Fallback:** Serves verified last-known snapshots from the `WeatherCache` table with age metadata and a high-contrast warning banner.
- **Outbound Rate-Limit Guard:** Sliding-window limiter protecting external API quota.
- **Admin Fault Injector UI (`/dashboard`):** Live toggle switches for **Simulate API Timeout**, **Simulate Malformed JSON**, and **Force Offline / Cache Mode** with an attempt-by-attempt latency & backoff log.

### A07 — Automated Multi-Step Workflow State Machine (`lib/workflowEngine.ts`)
Executes parametric claims through 5 persisted stages recorded in `WorkflowLog`:
1. `EVENT_DETECTED` (`TRIGGERED`) — Confirms observed value meets or exceeds threshold.
2. `POLICY_VALIDATED` (`VALIDATED`) — Confirms `ACTIVE` status and coverage date window.
3. `PAYOUT_CALCULATED` (`CALCULATED`) — Computes `min(CoverageAmount, CoverageAmount × Observed / Threshold)`.
4. `FUNDS_RESERVED` (`RESERVED`) — Checks idempotency lock and reserves pool liquidity atomically inside `prisma.$transaction`.
5. `DISBURSEMENT_ISSUED` (`DISBURSED`) — Debits insurer reserve, credits farmer wallet, and sets policy to `CLAIMED`.

- **Step 4 Rollback & Safe Recovery:** Simulating a Step 4 failure rolls back the reservation atomically (`৳0` disbursed), pauses the claim at `CALCULATED` (Step 3), and allows one-click **Resume Workflow** directly from Step 4 → Step 5 without re-running Steps 1–3.
- **Idempotency Safeguards:** Deterministic `idempotencyKey` (`IDEM-${policyId}-${triggerDate}`) plus transactional checks block duplicate disbursements with `409 Conflict`.

---

## API Routes Summary

| Endpoint | Methods | Purpose |
| :--- | :--- | :--- |
| `/api/farms` | `GET`, `POST` | List role-scoped farms; register farm plot with lat/lon validation |
| `/api/farms/[id]` | `GET`, `DELETE` | Fetch or cascade-delete a farm (`403` on cross-farmer access) |
| `/api/policies` | `GET`, `POST` | List role-scoped policies; issue parametric policy with financial guards |
| `/api/policies/[id]` | `PATCH` | Cancel or update policy status with ownership verification |
| `/api/weather` | `GET`, `POST` | Load telemetry + aggregate KPIs; run A06 resilient Open-Meteo sync |
| `/api/weather/evaluate` | `POST` | Combined A06 + A07 parametric evaluation with Admin fault/failure flags |
| `/api/claims` | `GET`, `POST` | Load role-scoped claim ledger & logs; execute parametric claim pipeline |
| `/api/claims/[id]/resume` | `POST` | Resume paused Step-3 claim directly from Step 4 → Step 5 |
| `/api/users` | `GET` | Return active session user balance and farmer directory (Admin) |
| `/api/demo/reset` | `POST` | Admin-only one-click reset back to clean seeded demo dataset |

---

## Local Setup

### 1. Prerequisites
- Node.js `18.x` or `20.x`+
- A PostgreSQL database (Supabase **Session Pooler** URI recommended for IPv4 compatibility both locally and on Vercel)

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your PostgreSQL connection string (percent-encode any special characters in your password such as `@` → `%40` and `#` → `%23`):

```env
DATABASE_URL="postgresql://postgres.YOUR_PROJECT_REF:YOUR_ENCODED_PASSWORD@aws-0-YOUR-REGION.pooler.supabase.com:5432/postgres?sslmode=require"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"
```

> **Security Note:** `.env` is listed in `.gitignore`. Never commit credentials or database URLs to version control.

### 4. Push Schema & Seed Database
```bash
npx prisma db push
npx prisma db seed
```

This seeds the Bangladesh dataset:
- **1 Risk Admin:** Abdul Karim (`abdul.karim@weathershield.bd`, `৳25,00,000` liquidity reserve pool)
- **2 Farmers:** Rokon Uddin (`rokon.uddin@krishi.bd`) & Fatima Begum (`fatima.begum@krishi.bd`)
- **5 District Farm Plots:** Sunamganj (Haor), Kurigram (Riverine), Bogura, Satkhira (Coastal), and Rajshahi (Barind Tract)
- **6 Active Parametric Policies** (`৳15,000`–`৳45,000`, `৳1,55,000` total active liability) + **5 `Asia/Dhaka` `WeatherCache` snapshots**

### 5. Run Locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

### Useful Scripts
```bash
npm run typecheck   # Strict TypeScript check (tsc --noEmit)
npm run lint        # Next.js ESLint check
npm run build       # Prisma generate + Next.js production build
npm run start       # Run production server locally
```

---

## Quick Judge Demo Walkthrough (3 Minutes)

1. **Role Isolation & Registry (`/farms`, `/policies`):**
   - Start in **Farmer View** (`Rokon Uddin`). Switch personas to `Fatima Begum` to observe isolated Bangladesh plots and policies.
   - Select any of the 5 climate-vulnerable Bangladesh districts (**Sunamganj**, **Satkhira**, **Rajshahi**, **Kurigram**, **Bogura**), enter land size in **Bigha** or **Acres**, or try invalid latitude `105` / negative coverage `-500` to verify inline + toast validation alerts.
   - Register a new plot and issue a `৳15,000` `RAINFALL_MAX` policy.
2. **A06 Weather API Resilience (`/dashboard`):**
   - Switch to **Admin View** (`Abdul Karim`) in the header.
   - Toggle **Simulate API Timeout** and click **Run Fault Test** — observe the 3.5s `AbortController` timeout across 3 exponential backoff retries, warning banner, toast alert, and verified `WeatherCache` fallback.
   - Toggle **Simulate Malformed JSON** to verify dirty payload rejection and fallback.
3. **A07 Workflow State Machine & Recovery (`/claims`):**
   - Click **Simulate Step 4 Failure** — verify Steps 1–3 succeed, Step 4 rolls back atomically (`CALCULATED`, `৳0` disbursed), and logs are persisted.
   - Click **Resume Workflow (Step 4 → 5)** — verify execution resumes directly at Step 4 without re-running Steps 1–3 and credits the farmer wallet.
   - Click **Test Idempotency Lock** — verify `409 DUPLICATE_BLOCKED` prevents double payouts.
   - Use **Policy Status** filtering, search, and dynamic sorting on the Claims Table, or click **Demo Reset** in the header to restore the clean dataset.

---

## Deploying to Vercel

1. Push the repository to a public GitHub repo (confirm `.env` is not tracked).
2. Import the repository in [Vercel](https://vercel.com).
3. Add `DATABASE_URL` (your IPv4-compatible Supabase **Session Pooler** URI with `?sslmode=require`) under **Project Settings → Environment Variables**.
4. Deploy — Vercel automatically runs `npm run build` (`prisma generate && next build`).
