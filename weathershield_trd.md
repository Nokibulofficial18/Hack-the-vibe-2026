# Technical Requirement Document (TRD)
## WeatherShield Architecture & Technical Specifications

---

## 1. Core Tech Stack
* **Framework:** Next.js 14 (App Router, Server Actions, API Routes)
* **Language:** TypeScript 5.x (Strict mode enabled)
* **Styling:** Tailwind CSS + Lucide React Icons + Shadcn UI primitive styling
* **Database & ORM:** SQLite (Development) / PostgreSQL (Production) via Prisma ORM
* **State & Sync:** React Hooks + Server Side Rendering (SSR)
* **External Weather API:** Open-Meteo API (`https://api.open-meteo.com/v1/forecast`)

---

## 2. System Architecture & Component Diagram

```
+-----------------------------------------------------------------------+
|                           NEXT.JS CLIENT UI                           |
|  [ Farmer Dashboard ]    [ Admin Control Panel ]    [ Live Monitors ] |
+-----------------------------------+-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                     NEXT.JS SERVER / API ROUTER                       |
|                                                                       |
|  +------------------------+        +-------------------------------+  |
|  | Auth & Access Control  |        | Business Logic & Rules Engine |  |
|  +------------------------+        +-------------------------------+  |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  |             ADVANCED CHALLENGE A06: RESILIENCE PIPELINE          |  |
|  |  Timeout Handler -> Exponential Retries -> Cache Fallback Store |  |
|  +-----------------------------------------------------------------+  |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  |            ADVANCED CHALLENGE A07: WORKFLOW STATE ENGINE        |  |
|  | Step 1: Detect -> Step 2: Validate -> Step 3: Calc -> Step 4: Pay|  |
|  +-----------------------------------------------------------------+  |
+-----------------------------------+-----------------------------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
            v                                               v
+-----------------------+                       +-----------------------+
|   EXTERNAL WEATHER    |                       |   DATABASE (PRISMA)   |
|   API (OPEN-METEO)    |                       | Users, Farms, Policies|
+-----------------------+                       | Claims, WorkflowLogs  |
                                                +-----------------------+
```

---

## 3. Database Schema (Prisma Format)

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  FARMER
  ADMIN
}

enum PolicyStatus {
  ACTIVE
  EXPIRED
  CLAIMED
  CANCELLED
}

enum ClaimStatus {
  TRIGGERED
  VALIDATED
  CALCULATED
  RESERVED
  DISBURSED
  FAILED
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  name         String
  role         Role     @default(FARMER)
  balance      Float    @default(0.0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  farms        Farm[]
}

model Farm {
  id          String   @id @default(uuid())
  name        String
  latitude    Float
  longitude   Float
  cropType    String
  sizeHectares Float
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  policies    Policy[]
  createdAt   DateTime @default(now())
}

model Policy {
  id              String       @id @default(uuid())
  farmId          String
  farm            Farm         @relation(fields: [farmId], references: [id], onDelete: Cascade)
  metricType      String       // e.g., "RAINFALL_MAX", "DROUGHT_DAYS", "TEMP_MAX"
  thresholdValue  Float        // e.g., 100.0 (mm of rain)
  coverageAmount  Float        // Maximum payout limit
  premiumPaid     Float
  startDate       DateTime
  endDate         DateTime
  status          PolicyStatus @default(ACTIVE)
  claims          Claim[]
  createdAt       DateTime     @default(now())
}

model Claim {
  id              String       @id @default(uuid())
  policyId        String
  policy          Policy       @relation(fields: [policyId], references: [id])
  idempotencyKey  String       @unique // Prevents duplicate payouts
  triggerValue    Float        // Actual weather value observed
  payoutAmount    Float        @default(0.0)
  status          ClaimStatus  @default(TRIGGERED)
  currentStep     Int          @default(1) // Track workflow progress (1 to 5)
  failureReason   String?
  workflowLogs    WorkflowLog[]
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
}

model WorkflowLog {
  id          String   @id @default(uuid())
  claimId     String
  claim       Claim    @relation(fields: [claimId], references: [id], onDelete: Cascade)
  stepName    String
  status      String   // "SUCCESS", "FAILED", "RETRIED"
  details     String
  timestamp   DateTime @default(now())
}

model WeatherCache {
  id          String   @id @default(uuid())
  latitude    Float
  longitude   Float
  weatherData String   // JSON stringified payload
  fetchedAt   DateTime @default(now())

  @@index([latitude, longitude])
}
```

---

## 4. REST & Server Action API Contracts

### `POST /api/farms`
* **Purpose:** Create farm plot for authenticated user.
* **Body:** `{ name, latitude, longitude, cropType, sizeHectares }`
* **Validation:** Latitude between $-90$ and $90$, Longitude between $-180$ and $180$.

### `POST /api/policies`
* **Purpose:** Issue a parametric policy for a specific farm.
* **Body:** `{ farmId, metricType, thresholdValue, coverageAmount, premiumPaid }`

### `POST /api/weather/evaluate` (Advanced Challenge Core)
* **Purpose:** Triggers weather fetch (A06) and parametric workflow pipeline (A07) for active policies.
* **Query/Body:** `{ policyId, forceSimulatedFailure?: boolean, forceApiTimeout?: boolean }`

---

## 5. Detailed Architecture for Advanced Technical Challenges

### 5.1 A06 Implementation Specifications (Resilient External API)
```typescript
// Algorithm Logic for Resilient Weather Fetch:
async function fetchWeatherResilient(lat: number, lon: number, simulateTimeout = false) {
  const CACHE_TTL_MINUTES = 30;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5s timeout
      
      if (simulateTimeout) throw new Error("API_TIMEOUT_SIMULATED");

      const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=rain_sum,temperature_2m_max&timezone=auto`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) throw new Error(`HTTP_ERROR_${response.status}`);
      const data = await response.json();
      
      // Update Cache
      await saveToCache(lat, lon, data);
      return { data, source: 'LIVE_API', attempt };
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        // Fallback to cache on final failure
        const cached = await getFromCache(lat, lon);
        if (cached) return { data: cached, source: 'CACHE_FALLBACK', error: error.message };
        throw new Error("API_AND_CACHE_FAILED");
      }
      await sleep(Math.pow(2, attempt) * 100); // Exponential backoff
    }
  }
}
```

### 5.2 A07 Implementation Specifications (Parametric Workflow Pipeline)
* **Step 1: Detection (`EVENT_DETECTED`)** — Check weather value vs policy threshold ($Observed \ge Threshold$).
* **Step 2: Validation (`POLICY_VALIDATED`)** — Ensure policy is `ACTIVE` and current date within coverage window.
* **Step 3: Calculation (`PAYOUT_CALCULATED`)** — Compute payout using severity multiplier:
  $$\text{Payout} = \min\left(\text{CoverageAmount}, \text{CoverageAmount} \times \frac{\text{ObservedValue}}{\text{ThresholdValue}}\right)$$
* **Step 4: Reservation (`FUNDS_RESERVED`)** — Reserve cash in pool.
* **Step 5: Disbursement (`DISBURSEMENT_ISSUED`)** — Debit insurer account, credit farmer account balance, set claim to `DISBURSED`, mark policy `CLAIMED`.
* **Idempotency Safeguard:** Generated key `IDEM-${policyId}-${triggerDate}` guarantees that running the workflow multiple times never executes multiple payouts for the same trigger.