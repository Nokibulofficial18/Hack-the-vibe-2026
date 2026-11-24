# Step-by-Step Implementation Roadmap
## WeatherShield Building Sequence for AntiGravity / Vibe Coding

---

## Overview
Follow this linear 5-phase guide to construct WeatherShield from scratch using AntiGravity. Each phase guarantees that mandatory baseline capabilities are solid before advanced features are linked.

---

## Phase 1: Project Initialization & Data Layer Setup
1. **Initialize Next.js App:**
   ```bash
   npx create-next-app@latest weathershield --typescript --tailwind --eslint --app --src-dir=false
   cd weathershield
   npm install @prisma/client lucide-react clsx tailwind-merge
   npm install -D prisma
   ```
2. **Setup Prisma Schema:**
   * Copy the Prisma schema from `trd.md` into `prisma/schema.prisma`.
   * Run SQLite migration: `npx prisma migrate dev --name init`.
   * Create seed file `prisma/seed.ts` with mock data for 1 Admin, 2 Farmers, 3 Farms, and 4 Active Policies.

---

## Phase 2: Core Interconnected Functional Modules (M01, M02, M03)
1. **Authentication & Session Mock Engine (`lib/auth.ts`):**
   * Implement quick-switch session context between **Farmer View** and **Admin View** for fast judge demonstration.
   * Add middleware restricting access to farm creation and payout details based on user ID.
2. **Module 1: Farm & Policy Registry (`/app/farms` & `/app/policies`):**
   * Build interactive forms to register farm locations (with interactive coordinate pickers / input limits).
   * Implement policy creation with threshold metrics (e.g., Rainfall $> 100\text{mm}$).
3. **Module 2: Weather Monitoring Dashboard (`/app/dashboard`):**
   * Build live cards displaying monitored farm locations and their current environmental status.
4. **Module 3: Claim & Payout Ledger (`/app/claims`):**
   * Build transparent audit log displaying claim status, triggered weather values, calculated payout amounts, and timestamps.

---

## Phase 3: Advanced Challenge A06 — Weather API Resilience Pipeline
1. **Resilience Engine Builder (`lib/weatherResilience.ts`):**
   * Implement `fetchWeatherWithResilience(lat, lon, options)`.
   * Integrate timeout signal (`AbortController`), retry loop with exponential backoff delays, and error logging.
2. **Cache System Integration (`lib/cache.ts`):**
   * Write fallback logic reading from `WeatherCache` table when external HTTP request fails.
3. **Interactive Fault Injector UI Widget:**
   * Add toggle switches on the UI allowing judges to simulate:
     * `[ ] Simulate API Timeout (3.5s)`
     * `[ ] Simulate Malformed JSON Response`
     * `[ ] Force Offline / Cache Mode`

---

## Phase 4: Advanced Challenge A07 — Parametric Workflow State Machine
1. **State Machine Pipeline Engine (`lib/workflowEngine.ts`):**
   * Create step-by-step handler function `executeParametricClaimWorkflow(policyId, triggerValue)`.
   * Explicitly record each step state (`TRIGGERED` $\rightarrow$ `VALIDATED` $\rightarrow$ `CALCULATED` $\rightarrow$ `RESERVED` $\rightarrow$ `DISBURSED`) into the `WorkflowLog` table.
2. **Idempotency & Lock Safeguards:**
   * Enforce unique `idempotencyKey` check before executing step 4 & 5.
3. **Interactive Workflow Tester Widget:**
   * Build a dedicated visual Workflow Runner component showing step-by-step progress bars and state badges (`Success`, `Pending`, `Failed`).
   * Add a `[ Simulate Intermediate Failure at Step 4 ]` button to prove transaction rollback and safe resume capabilities.

---

## Phase 5: UI Polish, Edge Cases, Accessibility & Verification (M04-M08)
1. **Dynamic Data Processing (M05):**
   * Implement dynamic search/filter by status (`ACTIVE`, `CLAIMED`) and sorting by coverage amount or date.
   * Add aggregate KPI metrics header: Total Active Liability, Total Payouts Issued, Healthy vs Risk-Triggered Policies.
2. **Error & Edge-Case Guardrails (M06):**
   * Form validations: invalid coordinate alerts, negative coverage amount rejection.
   * Duplicate execution toast notifications.
3. **Accessibility & Responsive Polish (M07):**
   * High contrast status tags, accessible ARIA roles, clean mobile grid layout.