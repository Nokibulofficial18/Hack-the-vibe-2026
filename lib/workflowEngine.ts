import { ClaimStatus, PayoutMethod, PolicyStatus, type Prisma } from "@prisma/client";
import prisma from "./prisma";
import {
  evaluateTieredPayout,
  generateMfsTransactionId,
  getMetricMeta,
  getPayoutMethodMeta,
  maskBdMobileNumber,
  type PayoutMethodType,
} from "./domain";
import { formatCurrency } from "./utils";

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
    description: "Apply tiered breach rules: Moderate (50% coverage) or Severe (100% coverage).",
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
    description:
      "Send instant bKash/Nagad/Rocket payout, credit wallet, and issue digital receipt.",
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
              payoutMethod: true,
              mobileNumber: true,
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

async function executeSettlementSteps(
  claimId: string,
  options: {
    simulateStep4Failure?: boolean;
    isResume?: boolean;
    stepsExecuted: string[];
  }
): Promise<WorkflowExecutionResult> {
  const existing = await fetchHydratedClaim(claimId);

  if (existing.status === ClaimStatus.DISBURSED || existing.currentStep >= 5) {
    return {
      outcome: "DUPLICATE_BLOCKED",
      claim: existing,
      stepsExecuted: options.stepsExecuted,
      resumedFromStep: null,
      duplicateBlocked: true,
      message: `Idempotency safeguard active: Claim ${existing.idempotencyKey} was already DISBURSED (${formatCurrency(existing.payoutAmount)} via ${getPayoutMethodMeta(existing.payoutMethod).label}). Duplicate payout prevented.`,
    };
  }

  const resumedFromStep = options.isResume ? existing.currentStep + 1 : null;
  const farmerWallet = existing.policy.farm.user;
  const walletMeta = getPayoutMethodMeta(farmerWallet.payoutMethod);

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
            `INSUFFICIENT_RESERVE_POOL: Available ${formatCurrency(insurerAdmin.balance)} < required ${formatCurrency(lockedClaim.payoutAmount)}`
          );
        }

        if (options.simulateStep4Failure) {
          throw new Error(
            `SIMULATED_STEP_4_FAILURE: Liquidity pool lock timeout during ${walletMeta.label} fund reservation. Transaction rolled back; ${formatCurrency(0)} disbursed.`
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
            details: `${options.isResume ? "Resumed from Step 4: " : ""}Reserved ${formatCurrency(lockedClaim.payoutAmount)} from insurer pool for ${walletMeta.label} transfer (${maskBdMobileNumber(farmerWallet.mobileNumber)}) under Idempotency Key ${lockedClaim.idempotencyKey}.`,
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
        message: `Steps 1–3 completed. Step 4 (FUNDS_RESERVED) failed and rolled back cleanly — claim paused at CALCULATED (Step 3) with ${formatCurrency(0)} disbursed. Click 'Resume Workflow' to recover from Step 4.`,
      };
    }
  }

  // --- STEP 5: DISBURSEMENT_ISSUED (Simulated bKash / Nagad / Rocket Settlement + Receipt) ---
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

    const beneficiary = lockedClaim.policy.farm.user;
    const payoutMethod = (beneficiary.payoutMethod ?? PayoutMethod.BKASH) as PayoutMethodType;
    const mfsMeta = getPayoutMethodMeta(payoutMethod);
    const transactionId = generateMfsTransactionId(payoutMethod);
    const disbursedAt = new Date();
    const maskedPhone = maskBdMobileNumber(beneficiary.mobileNumber);

    await tx.user.update({
      where: { id: beneficiary.id },
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
        payoutMethod: beneficiary.payoutMethod,
        recipientPhone: beneficiary.mobileNumber,
        transactionId,
        disbursedAt,
      },
    });

    await tx.workflowLog.create({
      data: {
        claimId: lockedClaim.id,
        stepName: "DISBURSEMENT_ISSUED",
        status: "SUCCESS",
        details: `Instant ${mfsMeta.label} payout of ${formatCurrency(lockedClaim.payoutAmount)} sent to ${beneficiary.name} (${maskedPhone}). Txn ID: ${transactionId}. Policy marked CLAIMED.`,
      },
    });

    return { alreadyDisbursed: false as const, transactionId, mfsLabel: mfsMeta.label };
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
      ? `Workflow resumed directly at Step 4 and completed Step 5 via ${settledClaim.mfsLabel} (Txn: ${settledClaim.transactionId}). Disbursed ${formatCurrency(finalClaim.payoutAmount)} to ${finalClaim.policy.farm.user.name}.`
      : `All 5 parametric workflow steps succeeded. Disbursed ${formatCurrency(finalClaim.payoutAmount)} (${finalClaim.severityTier} ${finalClaim.payoutPercentage}% tier) via ${settledClaim.mfsLabel} (Txn: ${settledClaim.transactionId}).`,
  };
}

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
        message: `Duplicate payout blocked by idempotency key (${idempotencyKey}). Claim already settled for ${formatCurrency(existingByKey.payoutAmount)}.`,
      };
    }

    return resumeParametricClaimWorkflow(existingByKey.id, {
      simulateStep4Failure,
    });
  }

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

  // --- STEP 3: PAYOUT_CALCULATED (M04 Tiered Parametric Rules: 50% Moderate / 100% Severe) ---
  const tierEval = evaluateTieredPayout(
    policy.metricType,
    policy.coverageAmount,
    triggerValue,
    policy.thresholdValue
  );

  await prisma.$transaction([
    prisma.claim.update({
      where: { id: createdClaim.id },
      data: {
        status: ClaimStatus.CALCULATED,
        currentStep: 3,
        payoutAmount: tierEval.payoutAmount,
        severityTier: tierEval.tier,
        payoutPercentage: tierEval.payoutPercentage,
      },
    }),
    prisma.workflowLog.create({
      data: {
        claimId: createdClaim.id,
        stepName: "PAYOUT_CALCULATED",
        status: "SUCCESS",
        details: `${tierEval.tierLabel}: Observed ${triggerValue}${metricMeta.unit} (Moderate ≥ ${policy.thresholdValue}${metricMeta.unit}, Severe ≥ ${tierEval.severeCutoff}${metricMeta.unit}) -> ${tierEval.payoutPercentage}% of ${formatCurrency(policy.coverageAmount)} = ${formatCurrency(tierEval.payoutAmount)}.`,
      },
    }),
  ]);
  stepsExecuted.push("PAYOUT_CALCULATED");

  return executeSettlementSteps(createdClaim.id, {
    simulateStep4Failure,
    isResume: false,
    stepsExecuted,
  });
}

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
      message: `Claim ${existing.idempotencyKey} is already DISBURSED (${formatCurrency(existing.payoutAmount)}). Idempotency safeguard prevented re-execution.`,
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
