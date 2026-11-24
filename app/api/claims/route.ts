import { NextResponse } from "next/server";
import { ClaimStatus, PolicyStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { canAccessResource, getServerSessionUser } from "@/lib/auth-server";
import { getObservedMetricValue } from "@/lib/domain";
import { getWeatherFromCache } from "@/lib/cache";
import { executeParametricClaimWorkflow } from "@/lib/workflowEngine";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const currentUser = await getServerSessionUser(request);
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (currentUser.role !== "ADMIN") {
      where.policy = { farm: { userId: currentUser.id } };
    }
    if (statusFilter && statusFilter !== "ALL") {
      where.status = statusFilter as ClaimStatus;
    }

    const [claims, activePolicies] = await Promise.all([
      prisma.claim.findMany({
        where,
        include: {
          policy: {
            include: {
              farm: {
                include: {
                  user: { select: { id: true, name: true, email: true, balance: true } },
                },
              },
            },
          },
          workflowLogs: {
            orderBy: { timestamp: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.policy.findMany({
        where:
          currentUser.role === "ADMIN"
            ? { status: PolicyStatus.ACTIVE }
            : { status: PolicyStatus.ACTIVE, farm: { userId: currentUser.id } },
        include: {
          farm: {
            select: {
              id: true,
              name: true,
              cropType: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const totalDisbursed = claims
      .filter((c) => c.status === ClaimStatus.DISBURSED)
      .reduce((sum, c) => sum + c.payoutAmount, 0);

    const activeLiability = activePolicies.reduce((sum, p) => sum + p.coverageAmount, 0);
    const pausedCount = claims.filter(
      (c) =>
        c.status !== ClaimStatus.DISBURSED &&
        c.status !== ClaimStatus.FAILED &&
        c.currentStep < 5
    ).length;

    return NextResponse.json({
      claims,
      activePolicies,
      currentUser,
      scope: currentUser.role === "ADMIN" ? "GLOBAL" : "USER_ISOLATED",
      metrics: {
        totalClaims: claims.length,
        disbursedCount: claims.filter((c) => c.status === ClaimStatus.DISBURSED).length,
        pausedCount,
        failedCount: claims.filter((c) => c.status === ClaimStatus.FAILED).length,
        totalDisbursed: Math.round(totalDisbursed * 100) / 100,
        activeLiability: Math.round(activeLiability * 100) / 100,
      },
    });
  } catch (error) {
    console.error("GET /api/claims error:", error);
    return NextResponse.json(
      { error: "Failed to fetch claim and payout ledger." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await getServerSessionUser(request);
    const body = (await request.json()) as {
      policyId?: string;
      observedValue?: number | string;
      simulateStep4Failure?: boolean;
    };

    if (!body.policyId) {
      return NextResponse.json(
        { error: "policyId is required to evaluate a parametric claim." },
        { status: 400 }
      );
    }

    const policy = await prisma.policy.findUnique({
      where: { id: body.policyId },
      include: { farm: true },
    });

    if (!policy) {
      return NextResponse.json({ error: "Policy not found." }, { status: 404 });
    }

    if (!canAccessResource(currentUser, policy.farm.userId)) {
      return NextResponse.json(
        { error: "Forbidden: You cannot trigger claims for another farmer's policy." },
        { status: 403 }
      );
    }

    let triggerValue: number | null = null;
    if (body.observedValue !== undefined && body.observedValue !== "") {
      if (currentUser.role !== "ADMIN") {
        return NextResponse.json(
          { error: "Forbidden: Only Risk Admins can inject simulated weather trigger values." },
          { status: 403 }
        );
      }
      const parsedOverride = Number(body.observedValue);
      if (Number.isNaN(parsedOverride) || parsedOverride < 0) {
        return NextResponse.json(
          { error: "Observed weather value must be a valid non-negative number." },
          { status: 400 }
        );
      }
      triggerValue = parsedOverride;
    } else {
      const cached = await getWeatherFromCache(policy.farm.latitude, policy.farm.longitude);
      triggerValue = getObservedMetricValue(policy.metricType, cached?.reading ?? null);
    }

    if (triggerValue === null) {
      return NextResponse.json(
        { error: "No weather reading available for this farm. Sync live weather first." },
        { status: 400 }
      );
    }

    if (body.simulateStep4Failure && currentUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Only Risk Admins can simulate Step 4 failures." },
        { status: 403 }
      );
    }

    const result = await executeParametricClaimWorkflow({
      policyId: policy.id,
      triggerValue,
      simulateStep4Failure:
        currentUser.role === "ADMIN" && Boolean(body.simulateStep4Failure),
    });

    const statusCode =
      result.outcome === "DISBURSED"
        ? 201
        : result.outcome === "PAUSED_AT_STEP_4"
          ? 202
          : result.outcome === "DUPLICATE_BLOCKED"
            ? 409
            : result.outcome === "NOT_TRIGGERED"
              ? 422
              : 400;

    return NextResponse.json(
      {
        triggered: result.outcome === "DISBURSED" || result.outcome === "PAUSED_AT_STEP_4",
        ...result,
        ...(result.outcome === "DUPLICATE_BLOCKED" ||
        result.outcome === "NOT_TRIGGERED" ||
        result.outcome === "FAILED"
          ? { error: result.message }
          : {}),
      },
      { status: statusCode }
    );
  } catch (error) {
    console.error("POST /api/claims error:", error);
    return NextResponse.json(
      { error: "Failed to execute parametric claim pipeline." },
      { status: 500 }
    );
  }
}
