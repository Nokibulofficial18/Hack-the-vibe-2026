# Product Requirement Document (PRD)
## WeatherShield — Parametric Micro-Insurance Engine for Small Farmers

---

## 1. Executive Summary & Competition Alignment
* **Project Name:** WeatherShield
* **Hackathon:** CODE-ARENAX: Hack the Vibe 2026 (Solo Vibe-Coding Championship)
* **Track Selected:** World Problem Solver Track
* **Target Audience:** Smallholder agricultural producers, rural co-ops, and agricultural micro-finance institutions (MFIs).
* **Core Value Proposition:** Traditional crop insurance requires lengthly manual field assessments, leading to months of delayed payouts after a disaster. WeatherShield automates climate risk protection through parametric micro-insurance: payouts trigger automatically when verified weather data (e.g., rainfall, drought index) breaches pre-agreed environmental thresholds, delivering liquidity to farmers in hours rather than months.

---

## 2. Problem Statement & Impact
* **The Problem:** Over 500 million smallholder farmers globally face severe climate risks (floods, extreme heat, droughts). Conventional indemnity insurance fails them due to high administrative costs, loss-verification delays (3–6 months), and fraud risk.
* **The Solution:** A parametric insurance application where policy contracts execute claims automatically based on objective third-party meteorological data.
* **Impact Metrics:** Eliminates manual claim verification, reduces claim settlement time from months to seconds, and provides guaranteed, transparent risk transfer.

---

## 3. User Roles & Personas

### 3.1 Farmer (Policyholder)
* **Needs:** Easy registration of farm plots, policy selection, live policy monitoring, instant payout notifications, and transparent payment history.
* **Access Level:** Access restricted to owned farm plots, active policies, and personal payout audit history.

### 3.2 Insurer / Admin (Risk Manager)
* **Needs:** Global dashboard to monitor exposure, define risk thresholds, view total liquidity pool, trigger manual data syncs for testing, and review automated workflow execution logs.
* **Access Level:** System-wide operational control, analytics, and administrative overrides.

---

## 4. Scope & Mandatory Requirements Mapping (60 Marks)

| ID | Requirement | Implementation in WeatherShield | Marks |
| :--- | :--- | :--- | :--- |
| **M01** | **Complete Functional System** | 3 interconnected functional modules: (1) Farm & Policy Registry, (2) Weather & Threshold Monitor, (3) Automated Claim & Payout Ledger. End-to-end flow from policy creation to payout. | 12 |
| **M02** | **Database Integration & Persistence** | Relational data model storing Users, Farms, Policies, WeatherLogs, Claims, and WorkflowExecutions with foreign key constraints and transactional integrity. | 8 |
| **M03** | **Authentication & Authorization** | Role-based access control (Farmer vs. Admin) with protected API routes, secure session management, and resource isolation (farmers cannot view other farmers' plots). | 8 |
| **M04** | **Complex Business Logic** | Tiered parametric evaluation logic ($Payout = Coverage \times SeverityTier$). Multi-condition state transitions (`ACTIVE` $\rightarrow$ `TRIGGERED` $\rightarrow$ `PROCESSING` $\rightarrow$ `DISBURSED` / `FAILED`). | 10 |
| **M05** | **Dynamic Data Processing** | Real-time search/filter/sort for policies and claims; dynamic calculations for aggregate insurer liability, risk exposure, and cumulative payouts. | 6 |
| **M06** | **Error & Edge-Case Handling** | Input validation (lat/long boundaries, positive coverage amounts), duplicate claim prevention per weather event, fault-tolerant API retries. | 8 |
| **M07** | **Responsive UI & Accessibility** | Clean mobile-first design using Tailwind CSS, proper ARIA labels, semantic markup, and accessible status indicators. | 4 |
| **M08** | **Deployment & Documentation** | Deployed on live production URL, public GitHub repo with setup guide, architecture notes, and clean README. | 4 |

---

## 5. Advanced Technical Challenges (40 Marks)

### 5.1 A06 — External API & Fault Tolerance (20 Marks)
* **Integration target:** Open-Meteo Historical & Forecast Weather API.
* **Resilience Mechanisms:**
  * **Strict Timeouts:** 3.5-second timeout window per weather fetch request.
  * **Exponential Backoff:** Up to 3 retry attempts with jitter ($t_{retry} = 2^n \times 100\text{ms} + \text{jitter}$).
  * **Fallback Store:** Serves last-known valid cached weather readings if the external service fails or returns malformed payloads.
  * **Rate Limiting Guard:** Throttles outbound API calls to prevent external IP banning.

### 5.2 A07 — Automated Multi-Step Workflow (20 Marks)
* **Parametric Claim State Machine Pipeline:**
  1. `EVENT_DETECTED`: Threshold breach verified by weather engine.
  2. `POLICY_VALIDATED`: Verification of active coverage status and policy expiration.
  3. `PAYOUT_CALCULATED`: Multi-tiered financial calculation based on severity index.
  4. `FUNDS_RESERVED`: Atomic debit operation on liquidity reserve pool.
  5. `DISBURSEMENT_ISSUED`: Generation of payout record and ledger posting.
* **Failure Recovery Logic:** If step 4 or 5 fails due to database locks or simulated network loss, the workflow pauses, logs the exact state snapshot, and allows safe recovery/resumption without duplicate financial payouts (Idempotency Key enforcement).

---

## 6. Non-Functional Requirements
* **Performance:** Page load $< 1.5$ seconds; API response time $< 300\text{ms}$ (excluding retries).
* **Security:** Public repository must contain ZERO secret keys or API tokens; environment variables managed via runtime config.
* **Reliability:** System state must remain consistent across network interruptions.