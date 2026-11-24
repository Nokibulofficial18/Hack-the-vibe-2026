# Comprehensive Test Plan & Judge Verification Manual
## WeatherShield Testing Strategy

---

## 1. Overview
This test plan provides comprehensive verification steps for judges to evaluate **WeatherShield** against the 100-Point Hackathon Rubric.

---

## 2. Mandatory Requirements Test Suite (60 Marks Verification)

### Test Case M-01: End-to-End Core Workflow (12 Marks)
* **Goal:** Verify seamless flow across the 3 interconnected modules.
* **Step 1:** Log in as Farmer (`farmer@example.com`).
* **Step 2:** Register a new Farm ("Valley Green", Lat: `14.5995`, Lon: `120.9842`).
* **Step 3:** Purchase a Parametric Policy (Metric: `RAINFALL_MAX`, Threshold: `50mm`, Coverage: `$1,000`).
* **Step 4:** Navigate to Admin Panel and click **"Run Weather Evaluation"**.
* **Expected Result:** Policy updates state; Claim is automatically generated in ledger; Farmer's wallet balance increases by computed payout.

### Test Case M-02: Database CRUD & Persistence (8 Marks)
* **Goal:** Verify persistent data storage and relationship integrity.
* **Step 1:** Create a farm and policy, then refresh the browser completely.
* **Expected Result:** Data persists intact without loss. Deleting a farm cascades and safely cleans associated policies without orphaned keys.

### Test Case M-03: Authentication & Isolation (8 Marks)
* **Goal:** Verify role security and user isolation.
* **Step 1:** Log in as `Farmer A`. Attempt to access `/api/farms` belonging to `Farmer B`.
* **Expected Result:** Access denied with `403 Forbidden` response.

### Test Case M-04 & M-05: Logic & Aggregations (16 Marks)
* **Goal:** Verify dynamic calculations and multi-condition rules.
* **Test Input:** Trigger rainfall of `75mm` against a `50mm` threshold policy with `$1,000` max coverage.
* **Expected Result:** Payout calculated dynamically based on severity ratio ($75/50 = 1.5 \rightarrow 100\%$ cap $= \$1,000$). Total Insurer Liability KPI updates automatically.

### Test Case M-06: Edge Cases & Validation (8 Marks)
* **Test Actions:**
  1. Input latitude `105.00` (Invalid). -> *Validator flags error.*
  2. Click "Submit Claim" twice rapidly. -> *Idempotency lock prevents double payout.*

---

## 3. Advanced Challenge A06 Verification (External API & Fault Tolerance - 20 Marks)

| Test ID | Scenario | Procedure | Expected System Behavior | Score Criteria Met |
| :--- | :--- | :--- | :--- | :--- |
| **A06-TC1** | Normal API Fetch | Click "Fetch Weather" with valid coordinates. | API returns HTTP 200 within $<1$ second; UI shows live temperature/rainfall. | Implementation Completeness (8m) |
| **A06-TC2** | API Timeout Simulation | Toggle `[x] Simulate Timeout` in test drawer and trigger sync. | Client waits exactly 3.5s timeout window, logs retry attempts, and smoothly displays cached fallback data with warning banner: *"External API timed out. Displaying cached weather snapshot."* | Complex Scenario Handling (6m) & Reliability (4m) |
| **A06-TC3** | Malformed Data Payload | Toggle `[x] Simulate Corrupted Response` (returns `{ invalid: true }`). | Resilience wrapper catches JSON parser exception, ignores dirty values, executes exponential backoff retry, and alerts admin. | Reliability & Technical Quality (4m) |

---

## 4. Advanced Challenge A07 Verification (Automated Multi-Step Workflow - 20 Marks)

| Test ID | Scenario | Procedure | Expected System Behavior | Score Criteria Met |
| :--- | :--- | :--- | :--- | :--- |
| **A07-TC1** | Full Automated Pipeline Run | Trigger parametric sync on policy exceeding threshold. | State machine cycles through all 5 steps (`TRIGGERED` $\rightarrow$ `VALIDATED` $\rightarrow$ `CALCULATED` $\rightarrow$ `RESERVED` $\rightarrow$ `DISBURSED`) with step-by-step audit logs recorded in `WorkflowLog`. | Implementation Completeness (8m) |
| **A07-TC2** | Mid-Workflow Failure & Recovery | Toggle `[x] Fail at Step 4 (Fund Reservation)` and run workflow. | Step 1-3 complete successfully; Step 4 fails cleanly; Claim state pauses at `CALCULATED` (step 3); transaction rolls back fund reservation; NO money is disbursed. | Complex Scenario Handling (6m) |
| **A07-TC3** | Workflow Resume / Idempotency | Click **"Resume Failed Workflow"** after resolving mock issue. | System picks up state directly at Step 4, completes Step 5 successfully, and updates state to `DISBURSED` without re-running Steps 1-3. | Reliability (4m) & Technical Understanding (2m) |

---

## 5. Quick Script for Live Judging Demonstration (3-Minute Demo)
1. **0:00 - 0:45 (Overview & M01):** Show Farmer Dashboard, register farm plot, purchase parametric drought policy.
2. **0:45 - 1:45 (A06 API Resilience):** Open Admin control panel. Toggle "Simulate API Timeout", trigger sync. Point out retry logs and fallback cache notification banner.
3. **1:45 - 2:30 (A07 Multi-Step Workflow):** Toggle "Simulate Step 4 Failure", trigger parametric claim. Show state machine pausing safely, then click "Resume Workflow" to demonstrate idempotency and recovery.
4. **2:30 - 3:00 (Conclusion & M07/M08):** Show dynamic analytics header, responsive design toggle, and point to GitHub setup README.