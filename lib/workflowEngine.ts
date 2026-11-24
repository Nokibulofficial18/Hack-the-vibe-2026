import { ClaimStatus, PolicyStatus, type Prisma } from "@prisma/client";
import prisma from "./prisma";
import { calculateParametricPayout, getMetricMeta } from "./domain";

export const WORKFLOW_STEPS = [
  {
    step: 1,
    name: "EVENT_DETECTED",
    label: "Event Detected",
    claimStatus: ClaimStatus.TRIGGERED,
    description: "Verify observed meteorological metric meets or exceeds policy threshold.",
  },
  {
    step: 2,
    name: "POLICY_VALIDATED",
    label: "Policy Validated",
    claimStatus: ClaimStatus.VALIDATED,
    description: "Confirm contract is ACTIVE and within its valid coverage date window.",
  },
  {
    step: 3,
    name: "PAYOUT_CALCULATED",
    label: "Payout Calculated",
    claimStatus: ClaimStatus.CALCULATED,
    description: "Compute severity-tiered payout capped at maximum policy coverage.",
  },
  {
    step: 4,
    name: "FUNDS_RESERVED",
    label: "Funds Reserved",
    claimStatus: ClaimStatus.RESERVED,
    description: "Verify idempotency lock and reserve liquidity atomically from insurer pool.",
  },
  {
    step: 5,
    name: "DISBURSEMENT_ISSUED",
    label: "Disbursement Issued",
    claimStatus: ClaimStatus.DISBURSED,
    description: "Debit insurer reserve, credit farmer wallet, and finalize CLAIMED state.",
  },
] as const;

const claimWithDetailsInclude = {
  workflowLogs: {
    orderBy: { timestamp: "asc" as const },
  },
  policy: {
    include: {
      farm: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              balance: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ClaimInclude;

export type HydratedClaim = Prisma.ClaimGetPayload<{
  include: typeof claimWithDetailsInclude;
}>;

export interface ExecuteWorkflowInput {
  policyId: string;
  triggerValue: number;
  simulateStep4Failure?: boolean;
  triggerDate?: string;
}

export type WorkflowOutcome =
  | "DISBURSED"
  | "PAUSED_AT_STEP_4"
  | "DUPLICATE_BLOCKED"
  | "NOT_TRIGGERED"
  | "FAILED";

export interface WorkflowExecutionResult {
  outcome: WorkflowOutcome;
  claim: HydratedClaim | null;
  stepsExecuted: string[];
  resumedFromStep: number | null;
  duplicateBlocked: boolean;
  message: string;
}

export function buildIdempotencyKey(policyId: string, triggerDate?: string): string {
  const datePart = triggerDate ?? new Date().toISOString().split("T")[0];
  return `IDEM-${policyId}-${datePart}`;
}

async function fetchHydratedClaim(claimId: string): Promise<HydratedClaim> {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: claimWithDetailsInclude,
  });
  if (!claim) {
    throw new Error(`CLAIM_NOT_FOUND:${claimId}`);
  }
  return claim;
}

/**
 * Executes Steps 4 (FUNDS_RESERVED) and 5 (DISBURSEMENT_ISSUED) with strict
 * idempotency safeguards and transactional rollback on Step 4 failure.
 */
async function executeSettlementSteps(
  claimId: string,
  options: {
    simulateStep4Failure?: boolean;
    isResume?: boolean;
    stepsExecuted: string[];
  }
): Promise<WorkflowExecutionResult> {
  const existing = await fetchHydratedClaim(claimId);

  // Strict Idempotency Guard: never re-execute steps 4 & 5 on a disbursed claim
  if (existing.status === ClaimStatus.DISBURSED || existing.currentStep >= 5) {
    return {
      outcome: "DUPLICATE_BLOCKED",
      claim: existing,
      stepsExecuted: options.stepsExecuted,
      resumedFromStep: null,
      duplicateBlocked: true,
      message: `Idempotency safeguard active: Claim ${existing.idempotencyKey} was already DISBURSED ($${existing.payoutAmount.toFixed(2)}). Duplicate payout prevented.`,
    };
  }

  const resumedFromStep = options.isResume ? existing.currentStep + 1 : null;

  // --- STEP 4: FUNDS_RESERVED ---
  if (existing.currentStep < 4) {
    try {
      await prisma.$transaction(async (tx) => {
        const lockedClaim = await tx.claim.findUnique({
          where: { id: existing.id },
          include: {
            workflowLogs: {
              where: { stepName: "DISBURSEMENT_ISSUED", status: "SUCCESS" },
            },
          },
        });

        if (!lockedClaim) {
          throw new Error("CLAIM_NOT_FOUND");
        }
        if (
          lockedClaim.status === ClaimStatus.DISBURSED ||
          lockedClaim.workflowLogs.length > 0
        ) {
          throw new Error("DUPLICATE_PAYOUT_BLOCKED");
        }

        const insurerAdmin = await tx.user.findFirst({
          where: { role: "ADMIN" },
          orderBy: { createdAt: "asc" },
        });

        if (!insurerAdmin) {
          throw new Error("INSURER_POOL_NOT_FOUND");
        }

        if (insurerAdmin.balance < lockedClaim.payoutAmount) {
          throw new Error(
            `INSUFFICIENT_RESERVE_POOL: Available $${insurerAdmin.balance.toFixed(2)} < required $${lockedClaim.payoutAmount.toFixed(2)}`
          );
        }

        // Simulated Mid-Workflow Failure at Step 4 (A07-TC2):
        // Throwing inside prisma.$transaction rolls back the reservation atomically.
        if (options.simulateStep4Failure) {
          throw new Error(
            "SIMULATED_STEP_4_FAILURE: Liquidity pool lock timeout during fund reservation. Transaction rolled back; $0.00 disbursed."
          );
        }

        await tx.claim.update({
          where: { id: lockedClaim.id },
          data: {
            status: ClaimStatus.RESERVED,
            currentStep: 4,
            failureReason: null,
          },
        });

        await tx.workflowLog.create({
          data: {
            claimId: lockedClaim.id,
            stepName: "FUNDS_RESERVED",
            status: options.isResume ? "RETRIED" : "SUCCESS",
            details: `${options.isResume ? "Resumed from Step 4: " : ""}Reserved $${lockedClaim.payoutAmount.toFixed(2)} from insurer pool (${insurerAdmin.email}) under Idempotency Key ${lockedClaim.idempotencyKey}.`,
          },
        });
      });

      options.stepsExecuted.push("FUNDS_RESERVED");
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Step 4 fund reservation failed.";

      if (reason === "DUPLICATE_PAYOUT_BLOCKED") {
        const latest = await fetchHydratedClaim(existing.id);
        return {
          outcome: "DUPLICATE_BLOCKED",
          claim: latest,
          stepsExecuted: options.stepsExecuted,
          resumedFromStep,
          duplicateBlocked: true,
          message: `Duplicate payout prevented by idempotency check (${latest.idempotencyKey}).`,
        };
      }

      // Clean failure persistence: keep claim paused at Step 3 (CALCULATED) with zero funds moved
      await prisma.$transaction([
        prisma.claim.update({
          where: { id: existing.id },
          data: {
            status: ClaimStatus.CALCULATED,
            currentStep: 3,
            failureReason: reason,
          },
        }),
        prisma.workflowLog.create({
          data: {
            claimId: existing.id,
            stepName: "FUNDS_RESERVED",
            status: "FAILED",
            details: reason,
          },
        }),
      ]);

      options.stepsExecuted.push("FUNDS_RESERVED (FAILED -> ROLLED BACK)");
      const pausedClaim = await fetchHydratedClaim(existing.id);

      return {
        outcome: "PAUSED_AT_STEP_4",
        claim: pausedClaim,
        stepsExecuted: options.stepsExecuted,
        resumedFromStep,
        duplicateBlocked: false,
        message:
          "Steps 1–3 completed. Step 4 (FUNDS_RESERVED) failed and rolled back cleanly — claim paused at CALCULATED (Step 3) with $0.00 disbursed. Click 'Resume Workflow' to recover from Step 4.",
      };
    }
  }

  // --- STEP 5: DISBURSEMENT_ISSUED ---
  const settledClaim = await prisma.$transaction(async (tx) => {
    const lockedClaim = await tx.claim.findUnique({
      where: { id: existing.id },
      include: {
        policy: {
          include: {
            farm: { include: { user: true } },
          },
        },
        workflowLogs: {
          where: { stepName: "DISBURSEMENT_ISSUED", status: "SUCCESS" },
        },
      },
    });

    if (!lockedClaim) {
      throw new Error("CLAIM_NOT_FOUND");
    }

    // Final transactional double-payout check
    if (
      lockedClaim.status === ClaimStatus.DISBURSED ||
      lockedClaim.workflowLogs.length > 0
    ) {
      return { alreadyDisbursed: true as const };
    }

    const insurerAdmin = await tx.user.findFirst({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "asc" },
    });

    if (insurerAdmin) {
      await tx.user.update({
        where: { id: insurerAdmin.id },
        data: { balance: { decrement: lockedClaim.payoutAmount } },
      });
    }

    await tx.user.update({
      where: { id: lockedClaim.policy.farm.userId },
      data: { balance: { increment: lockedClaim.payoutAmount } },
    });

    await tx.policy.update({
      where: { id: lockedClaim.policyId },
      data: { status: PolicyStatus.CLAIMED },
    });

    await tx.claim.update({
      where: { id: lockedClaim.id },
      data: {
        status: ClaimStatus.DISBURSED,
        currentStep: 5,
        failureReason: null,
      },
    });

    await tx.workflowLog.create({
      data: {
        claimId: lockedClaim.id,
        stepName: "DISBURSEMENT_ISSUED",
        status: "SUCCESS",
        details: `Debited $${lockedClaim.payoutAmount.toFixed(2)} from insurer pool, credited ${lockedClaim.policy.farm.user.name} (${lockedClaim.policy.farm.user.email}), and marked policy CLAIMED.`,
      },
    });

    return { alreadyDisbursed: false as const };
  });

  const finalClaim = await fetchHydratedClaim(existing.id);

  if (settledClaim.alreadyDisbursed) {
    return {
      outcome: "DUPLICATE_BLOCKED",
      claim: finalClaim,
      stepsExecuted: options.stepsExecuted,
      resumedFromStep,
      duplicateBlocked: true,
      message: `Idempotency lock prevented duplicate disbursement for ${finalClaim.idempotencyKey}.`,
    };
  }

  options.stepsExecuted.push("DISBURSEMENT_ISSUED");

  return {
    outcome: "DISBURSED",
    claim: finalClaim,
    stepsExecuted: options.stepsExecuted,
    resumedFromStep,
    duplicateBlocked: false,
    message: options.isResume
      ? `Workflow resumed directly at Step 4 and completed Step 5 without re-running Steps 1–3. Disbursed $${finalClaim.payoutAmount.toFixed(2)} to ${finalClaim.policy.farm.user.name}.`
      : `All 5 parametric workflow steps succeeded. Disbursed $${finalClaim.payoutAmount.toFixed(2)} to ${finalClaim.policy.farm.user.name}.`,
  };
}

/**
 * Advanced Challenge A07: Executes the 5-step parametric claim pipeline:
 * Step 1: EVENT_DETECTED -> Step 2: POLICY_VALIDATED -> Step 3: PAYOUT_CALCULATED
 * -> Step 4: FUNDS_RESERVED -> Step 5: DISBURSEMENT_ISSUED
 */
export async function executeParametricClaimWorkflow(
  input: ExecuteWorkflowInput
): Promise<WorkflowExecutionResult> {
  const { policyId, triggerValue, simulateStep4Failure = false } = input;
  const stepsExecuted: string[] = [];

  const policy = await prisma.policy.findUnique({
    where: { id: policyId },
    include: {
      farm: { include: { user: true } },
    },
  });

  if (!policy) {
    throw new Error("POLICY_NOT_FOUND");
  }

  const metricMeta = getMetricMeta(policy.metricType);
  const idempotencyKey = buildIdempotencyKey(policy.id, input.triggerDate);

  // Check Idempotency Key BEFORE creating a new claim or moving funds
  const existingByKey = await prisma.claim.findUnique({
    where: { idempotencyKey },
    include: claimWithDetailsInclude,
  });

  if (existingByKey) {
    if (existingByKey.status === ClaimStatus.DISBURSED || existingByKey.currentStep >= 5) {
      return {
        outcome: "DUPLICATE_BLOCKED",
        claim: existingByKey,
        stepsExecuted: [],
        resumedFromStep: null,
        duplicateBlocked: true,
        message: `Duplicate payout blocked by idempotency key (${idempotencyKey}). Claim already settled for $${existingByKey.payoutAmount.toFixed(2)}.`,
      };
    }

    // Existing claim is paused (e.g. paused at Step 3 after Step 4 failure) -> resume safely
    return resumeParametricClaimWorkflow(existingByKey.id, {
      simulateStep4Failure,
    });
  }

  // Step 1 pre-check: Weather threshold breach detection
  if (triggerValue < policy.thresholdValue) {
    return {
      outcome: "NOT_TRIGGERED",
      claim: null,
      stepsExecuted: [],
      resumedFromStep: null,
      duplicateBlocked: false,
      message: `Threshold not breached: observed ${triggerValue}${metricMeta.unit} is below policy threshold ${policy.thresholdValue}${metricMeta.unit}.`,
    };
  }

  // --- STEP 1: EVENT_DETECTED ---
  const createdClaim = await prisma.claim.create({
    data: {
      policyId: policy.id,
      idempotencyKey,
      triggerValue,
      payoutAmount: 0,
      status: ClaimStatus.TRIGGERED,
      currentStep: 1,
      workflowLogs: {
        create: {
          stepName: "EVENT_DETECTED",
          status: "SUCCESS",
          details: `Observed ${policy.metricType} of ${triggerValue}${metricMeta.unit} >= threshold ${policy.thresholdValue}${metricMeta.unit} on ${policy.farm.name}.`,
        },
      },
    },
  });
  stepsExecuted.push("EVENT_DETECTED");

  // --- STEP 2: POLICY_VALIDATED ---
  const now = new Date();
  const isPolicyActive = policy.status === PolicyStatus.ACTIVE;
  const isWithinWindow = now >= policy.startDate && now <= policy.endDate;

  if (!isPolicyActive || !isWithinWindow) {
    const reason = !isPolicyActive
      ? `Policy validation failed: contract status is ${policy.status} (must be ACTIVE).`
      : `Policy validation failed: current date is outside coverage window (${policy.startDate.toISOString().split("T")[0]} to ${policy.endDate.toISOString().split("T")[0]}).`;

    await prisma.$transaction([
      prisma.claim.update({
        where: { id: createdClaim.id },
        data: {
          status: ClaimStatus.FAILED,
          currentStep: 2,
          failureReason: reason,
        },
      }),
      prisma.workflowLog.create({
        data: {
          claimId: createdClaim.id,
          stepName: "POLICY_VALIDATED",
          status: "FAILED",
          details: reason,
        },
      }),
    ]);

    stepsExecuted.push("POLICY_VALIDATED (FAILED)");
    return {
      outcome: "FAILED",
      claim: await fetchHydratedClaim(createdClaim.id),
      stepsExecuted,
      resumedFromStep: null,
      duplicateBlocked: false,
      message: reason,
    };
  }

  await prisma.$transaction([
    prisma.claim.update({
      where: { id: createdClaim.id },
      data: {
        status: ClaimStatus.VALIDATED,
        currentStep: 2,
      },
    }),
    prisma.workflowLog.create({
      data: {
        claimId: createdClaim.id,
        stepName: "POLICY_VALIDATED",
        status: "SUCCESS",
        details: `Confirmed policy ${policy.id} is ACTIVE within coverage window (${policy.startDate.toISOString().split("T")[0]} to ${policy.endDate.toISOString().split("T")[0]}).`,
      },
    }),
  ]);
  stepsExecuted.push("POLICY_VALIDATED");

  // --- STEP 3: PAYOUT_CALCULATED ---
  const payoutAmount = calculateParametricPayout(
    policy.coverageAmount,
    triggerValue,
    policy.thresholdValue
  );
  const severityRatio = Number((triggerValue / policy.thresholdValue).toFixed(2));

  await prisma.$transaction([
    prisma.claim.update({
      where: { id: createdClaim.id },
      data: {
        status: ClaimStatus.CALCULATED,
        currentStep: 3,
        payoutAmount,
      },
    }),
    prisma.workflowLog.create({
      data: {
        claimId: createdClaim.id,
        stepName: "PAYOUT_CALCULATED",
        status: "SUCCESS",
        details: `Severity multiplier ${severityRatio}x (${triggerValue}/${policy.thresholdValue}) applied to $${policy.coverageAmount.toFixed(2)} cap -> calculated payout $${payoutAmount.toFixed(2)}.`,
      },
    }),
  ]);
  stepsExecuted.push("PAYOUT_CALCULATED");

  // --- STEPS 4 & 5: FUNDS_RESERVED -> DISBURSEMENT_ISSUED ---
  return executeSettlementSteps(createdClaim.id, {
    simulateStep4Failure,
    isResume: false,
    stepsExecuted,
  });
}

/**
 * Safely resumes a paused/failed workflow directly at `claim.currentStep + 1`
 * (e.g., Step 4 FUNDS_RESERVED -> Step 5 DISBURSEMENT_ISSUED) without re-running Steps 1–3.
 */
export async function resumeParametricClaimWorkflow(
  claimId: string,
  options: { simulateStep4Failure?: boolean } = {}
): Promise<WorkflowExecutionResult> {
  const existing = await fetchHydratedClaim(claimId);

  if (existing.status === ClaimStatus.DISBURSED || existing.currentStep >= 5) {
    return {
      outcome: "DUPLICATE_BLOCKED",
      claim: existing,
      stepsExecuted: [],
      resumedFromStep: null,
      duplicateBlocked: true,
      message: `Claim ${existing.idempotencyKey} is already DISBURSED ($${existing.payoutAmount.toFixed(2)}). Idempotency safeguard prevented re-execution.`,
    };
  }

  if (existing.currentStep < 3) {
    throw new Error(
      `Cannot resume claim at step ${existing.currentStep}; policy validation or calculation did not complete.`
    );
  }

  return executeSettlementSteps(existing.id, {
    simulateStep4Failure: Boolean(options.simulateStep4Failure),
    isResume: true,
    stepsExecuted: [],
  });
}
