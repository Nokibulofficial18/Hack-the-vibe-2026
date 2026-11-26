# WeatherShield Bangladesh — Parametric Micro-Insurance Platform

> **Automated BDT (৳) climate micro-insurance for smallholder farmers in Bangladesh, with instant bKash / Nagad / Rocket settlements, live Open-Meteo risk intelligence, and full English / বাংলা bilingual support.**

Built with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, **Recharts**, **Prisma ORM**, **Supabase PostgreSQL**, and the **Open-Meteo Weather API**.

---

## Overview

Traditional crop insurance relies on slow manual field inspections, delaying compensation for 3–6 months after haor flash floods, coastal cyclones, riverine floods, or Barind heatwaves. **WeatherShield** replaces manual loss verification with **parametric micro-insurance**: objective meteorological thresholds trigger automated, tiered **Bangladeshi Taka (৳ / BDT)** disbursements directly to farmers' mobile wallets in seconds—complete with digital transaction receipts and an immutable 5-step audit ledger.

---

## Key Features

### 1. Bangladesh-First Micro-Insurance Domain
- **Currency & Local Land Units:** All monetary figures use South Asian **BDT (`৳`)** grouping (e.g., `৳15,000`, `৳25,00,000` / `৳১৫,০০০`, `৳২৫,০০,০০০`), with land area measured in **Bigha (`বিঘা`)** alongside **Acres (`একর`)**.
- **5 Climate-Vulnerable District Presets:** Built-in GPS coordinates and local crop profiles for:
  - **Sunamganj (Haor)** (`25.0658, 91.3950`) — Flash Flood risk (*Boro Rice*)
  - **Satkhira (Coastal)** (`22.7185, 89.0705`) — Cyclone & Heavy Rainfall risk (*Aman Paddy / Shrimp Aquaculture*)
  - **Rajshahi (Barind Tract)** (`24.3745, 88.6042`) — Drought & Extreme Heat risk (*Mango / Wheat*)
  - **Kurigram (Riverine)** (`25.8054, 89.6362`) — Monsoon Flood risk (*Jute / Aman Paddy*)
  - **Bogura** (`24.8465, 89.3773`) — Irregular Rainfall risk (*Potato / Rice*)
- **Mobile Financial Service (MFS) Wallets:** Farmers configure **bKash**, **Nagad**, or **Rocket** payout wallets with strict Bangladesh mobile validation (`+8801[3-9]XXXXXXXX`, 14 chars).
- **Tiered Parametric Payout Engine (`M04`):**
  - **Moderate Breach (50% payout):** e.g., Rainfall `50mm–99mm`, Temperature `38°C–41.9°C`, Drought `14–20 days`.
  - **Severe Breach (100% payout):** e.g., Rainfall `≥ 100mm`, Temperature `≥ 42°C`, Drought `≥ 21 days`.
- **Digital Disbursement Receipts:** Step 5 completion generates a printable digital MFS receipt displaying the generated `bKash` / `Nagad` / `Rocket` Transaction ID (`BKS...` / `NGD...` / `RKT...`), `Asia/Dhaka` timestamp, masked phone number (`+880 17XX-XXX678`), severity tier, exact `৳` credited, and `idempotencyKey` lock.

### 2. Climate Risk Intelligence & Geospatial Dashboard (`/dashboard`)
- **Interactive Bangladesh SVG Risk Map:** Plots all monitored district farms as color-coded pins—**Green (Safe)**, **Amber (Warning — within 15% of threshold)**, and **Red (Breached)**. Clicking any pin opens a slide-over drawer with live Open-Meteo telemetry, policy progress bars, and one-click claim triggers.
- **Responsive Recharts Analytics (`M05`):**
  - **Total Coverage vs. Payouts by District (`৳`)** bar chart with vertical gradient fills.
  - **7-Day Rainfall & Temperature Trend** composed area chart with smooth SVG `<linearGradient>` fills fading to transparent and a dashed **Policy Trigger Threshold** reference line.
- **Aggregate KPI Cards:** Live **Total Coverage**, **Total Payouts**, **Active Risk Exposure**, and **Safe vs. Monitored** counts with skeleton loaders during async fetches.

### 3. Complete English / বাংলা (Bangla) Localization (`M07`)
- **Native Typography:** Loads Google Font **`Hind_Siliguri`** (`weights: 400–700`, `subsets: ['bengali', 'latin']`) via `next/font/google` and applies it dynamically with `leading-relaxed` when Bangla mode is active.
- **100% Bilingual Coverage (`lib/i18n.ts`):** Every navigation item, sidebar label, hero banner, KPI card, form field, table header, status badge, map pin, Recharts axis/day label, district/farm/crop/farmer name, MFS wallet provider, digital receipt, Judge Demo drawer, and toast notification switches seamlessly between English and natural Bangladeshi Bangla (including Bengali numerals `০-৯`).

### 4. Modern Fintech UI & One-Click Judge Demo Drawer
- **Stripe/Linear-Inspired Light Fintech Aesthetic:** Subtle radial emerald-to-teal ambient background mesh, frosted glassmorphism sticky top header (`bg-white/75 backdrop-blur-md`), fixed `w-64` collapsible left sidebar, dark emerald-to-teal hero welcome banners, gradient primary actions, top-accented KPI cards, and soft pastel status pills.
- **Role-Based Dual Views:** Switch instantly in the sidebar between **Farmer** (`Rokon Uddin`, `Fatima Begum` — strict owner isolation) and **Admin** (`Abdul Karim` — global exposure, fault testing, workflow recovery, and Demo Reset).
- **Top-Header Slide-Over Judge Demo Panel (Admin Only):** Tucked cleanly inside a slide-over drawer triggered from the sticky top header—lets judges test **A06** and **A07** in one click from any page.

---

## System Architecture

```text
+-----------------------------------------------------------------------+
|                           NEXT.JS CLIENT UI                           |
|  [ Dashboard ] [ Farm Registry ] [ Policies ] [ Monitor ] [ Claims ]  |
|  [ Fixed Sidebar + Role Switcher ] [ EN | বাংলা ] [ Judge Drawer ]    |
|  [ Bangladesh Risk Map ] [ Recharts Trends ] [ Accessible Toasts ]    |
+-----------------------------------+-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                    NEXT.JS 14 APP ROUTER / API LAYER                  |
|                                                                       |
|  +------------------------+        +-------------------------------+  |
|  | RBAC & Resource Guard  |        | Validation, MFS & Tier Rules  |  |
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
|  |  1. Detect -> 2. Validate -> 3. Tiered Calc -> 4. Reserve ->    |  |
|  |  5. MFS Disburse + Digital Receipt (Rollback + Resume + Lock)   |  |
|  +-----------------------------------------------------------------+  |
+-----------------------------------+-----------------------------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
            v                                               v
+-----------------------+                       +-----------------------+
|   EXTERNAL WEATHER    |                       |  SUPABASE POSTGRESQL  |
|   API (OPEN-METEO)    |                       |     (PRISMA ORM)      |
|  /v1/forecast (7d)    |                       | Users, Farms, Policies|
+-----------------------+                       | Claims, WorkflowLogs, |
                                                | WeatherCache          |
                                                +-----------------------+
```

---

## Tech Stack

- **Framework:** Next.js 14.2 (`App Router`, Server Components, Route Handlers, `next/font/google`)
- **Language:** TypeScript 5 (Strict mode)
- **Styling, Charts & Icons:** Tailwind CSS 3, Recharts 3, Lucide React, Hind Siliguri font
- **Database & ORM:** PostgreSQL (Supabase Session Pooler) via Prisma ORM 6
- **Weather Data:** Open-Meteo Forecast API (`https://api.open-meteo.com/v1/forecast`, `Asia/Dhaka` 7-day daily feed)

---

## Advanced Technical Challenges

### A06 — External API & Fault Tolerance (`lib/weatherResilience.ts`, `lib/cache.ts`)
- **Strict 3.5-Second Timeout:** Enforced per outbound request via `AbortController`.
- **Exponential Backoff Retries:** Up to 3 attempts with exponential delay + jitter (`2^attempt × 100ms + jitter`).
- **Payload Schema Guard:** Rejects malformed/corrupted JSON responses before any write so `WeatherCache` is never poisoned.
- **Automatic Cache Fallback:** Serves last-known verified snapshots from `WeatherCache` with cache-age metadata and a clear fallback banner.
- **Outbound Rate-Limit Guard:** Sliding-window limiter protecting external API quota (`30 req/min`).
- **Interactive Testing:** Test via the **Judge Demo Panel** (top header in Admin mode) or the **Fault Injector** on `/dashboard` (**Simulate API Timeout**, **Simulate Malformed JSON**, **Force Offline / Cache Mode**).

### A07 — Automated Multi-Step Workflow State Machine (`lib/workflowEngine.ts`)
Executes parametric claims through 5 persisted stages recorded in `WorkflowLog`:
1. `EVENT_DETECTED` (`TRIGGERED`) — Confirms observed weather meets or exceeds the policy threshold.
2. `POLICY_VALIDATED` (`VALIDATED`) — Confirms `ACTIVE` status and active coverage window.
3. `PAYOUT_CALCULATED` (`CALCULATED`) — Evaluates tiered payout (**50% Moderate** vs. **100% Severe**).
4. `FUNDS_RESERVED` (`RESERVED`) — Verifies `idempotencyKey` lock and reserves insurer pool liquidity atomically inside `prisma.$transaction`.
5. `DISBURSEMENT_ISSUED` (`DISBURSED`) — Debits insurer reserve, credits farmer wallet, stamps MFS `transactionId` + `disbursedAt`, and transitions policy to `CLAIMED`.

- **Step 4 Rollback & Safe Recovery:** Simulating a Step 4 failure rolls back the reservation atomically (`৳0` disbursed), pauses the claim at `CALCULATED` (Step 3), and enables one-click **Resume Workflow (Step 4 → 5)** without re-running Steps 1–3.
- **Idempotency Safeguards:** Deterministic `idempotencyKey` (`IDEM-${policyId}-${triggerDate}`) plus transactional checks block duplicate bKash/Nagad/Rocket payouts with `409 Conflict`.

---

## API Routes Summary

| Endpoint | Methods | Purpose |
| :--- | :--- | :--- |
| `/api/farms` | `GET`, `POST` | List role-scoped farms; register plot with lat/lon (`-90..90`, `-180..180`) & area validation |
| `/api/farms/[id]` | `GET`, `DELETE` | Fetch or cascade-delete a farm (`403` on cross-farmer access) |
| `/api/policies` | `GET`, `POST` | List role-scoped policies; issue parametric policy with BDT coverage guards |
| `/api/policies/[id]` | `PATCH` | Cancel or update policy status with ownership verification |
| `/api/weather` | `GET`, `POST` | Load telemetry, KPIs & district charts; run A06 resilient Open-Meteo sync |
| `/api/weather/evaluate` | `POST` | Combined A06 + A07 parametric evaluation with tiered rules & Admin fault flags |
| `/api/claims` | `GET`, `POST` | Load role-scoped claim ledger, receipts & logs; execute parametric claim pipeline |
| `/api/claims/[id]/resume` | `POST` | Resume paused Step-3 claim directly from Step 4 → Step 5 with idempotency lock |
| `/api/users` | `GET`, `PATCH` | Return active session user & farmer directory; update bKash/Nagad/Rocket wallet & BD phone |
| `/api/demo/reset` | `POST` | Admin-only one-click reset back to clean seeded Bangladesh dataset |

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
Copy `.env.example` to `.env` and add your PostgreSQL connection string (percent-encode special characters in passwords such as `@` → `%40` and `#` → `%23`):

```env
DATABASE_URL="postgresql://postgres.YOUR_PROJECT_REF:YOUR_ENCODED_PASSWORD@aws-0-YOUR-REGION.pooler.supabase.com:5432/postgres?sslmode=require"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"
```

> **Security Note:** `.env` is excluded via `.gitignore`. Never commit secrets or database credentials.

### 4. Push Schema & Seed Database
```bash
npx prisma db push
npx prisma db seed
```

This seeds the Bangladesh dataset:
- **1 Risk Admin:** Abdul Karim (`abdul.karim@weathershield.bd`, Rocket `+8801911223344`, `৳25,00,000` reserve pool)
- **2 Farmers:** Rokon Uddin (`rokon.uddin@krishi.bd`, bKash `+8801712345678`) & Fatima Begum (`fatima.begum@krishi.bd`, Nagad `+8801819876543`)
- **5 District Farm Plots:** Sunamganj (Haor), Kurigram (Riverine), Bogura, Satkhira (Coastal), and Rajshahi (Barind Tract)
- **6 Active Parametric Policies** (`৳15,000`–`৳45,000`, `৳1,55,000` total active coverage) + **5 7-day `Asia/Dhaka` `WeatherCache` snapshots**

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

## Live Judging Walkthrough (2 Minutes)

1. **Bilingual Switching & Mobile Wallets (`/`):**
   - Click **`বাংলা`** in the sticky top header to switch the entire platform (sidebar, KPI cards, map pins, Recharts axes, receipts, and Bengali numerals) into crisp **Hind Siliguri** Bangla, then toggle back anytime.
   - Update a farmer's **bKash / Nagad / Rocket** wallet number (`+8801XXXXXXXXX`) and observe live validation & toast feedback.
2. **Role Isolation, Districts & Tiered Policies (`/farms`, `/policies`):**
   - Switch between **Farmer** personas (`Rokon Uddin` ↔ `Fatima Begum`) in the left sidebar to verify strict tenant isolation.
   - Register a plot using any of the 5 Bangladesh district presets in **Bigha** or **Acres**, and preview the **50% Moderate / 100% Severe** BDT payout tiers when issuing a policy.
3. **Interactive Risk Map & Recharts (`/dashboard`):**
   - Click color-coded district pins on the **Bangladesh Live Risk Map** to open the telemetry slide-over drawer.
   - Inspect the **Total Coverage vs. Payouts by District** and **7-Day Rainfall & Temperature Trend** charts.
4. **One-Click A06 & A07 Verification (Admin `Judge Demo` Drawer):**
   - Switch to **Admin** (`Abdul Karim`) in the sidebar and click **`Judge Demo`** in the sticky top header.
   - **Tab A06:** Click **Simulate Open-Meteo Timeout (3.5s)** and **Simulate Malformed JSON** to watch live 3x backoff retries and automatic `WeatherCache` fallback.
   - **Tab A07:** Click **Trigger Sunamganj Flash Flood (120mm) + Fail at Step 4** (`৳0` disbursed, safely rolled back), click **Resume & Recover Workflow (Step 4 → 5)** to generate the `৳30,000` bKash digital receipt, then click **Verify Idempotency** to prove `409 Conflict` blocks any duplicate payout.
   - Click **Reset** in the drawer (or **Demo Reset** in the sidebar) to restore the clean seed dataset for the next judge.

---

## Deploying to Vercel

1. Push the repository to GitHub (verify `.env` is not tracked).
2. Import the repository in [Vercel](https://vercel.com).
3. Add `DATABASE_URL` (IPv4-compatible Supabase **Session Pooler** URI with `?sslmode=require`) under **Project Settings → Environment Variables**.
4. Deploy — Vercel automatically runs `npm run build` (`prisma generate && next build`).
