import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { canAccessResource, getServerSessionUser } from "@/lib/auth-server";
import { getObservedMetricValue } from "@/lib/domain";
import { fetchWeatherWithResilience } from "@/lib/weatherResilience";
import { executeParametricClaimWorkflow } from "@/lib/workflowEngine";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const currentUser = await getServerSessionUser(request);
    const body = (await request.json()) as {
      policyId?: string;
      observedValue?: number | string;
      forceSimulatedFailure?: boolean;
      forceApiTimeout?: boolean;
      simulateMalformedJson?: boolean;
      forceOffline?: boolean;
    };

    if (!body.policyId) {
      return NextResponse.json(
        { error: "policyId is required to run parametric evaluation." },
        { status: 400 }
      );
    }

    const hasSimulationFlags = Boolean(
      body.forceSimulatedFailure ||
        body.forceApiTimeout ||
        body.simulateMalformedJson ||
        body.forceOffline ||
        (body.observedValue !== undefined && body.observedValue !== "")
    );

    if (hasSimulationFlags && currentUser.role !== "ADMIN") {
      return NextResponse.json(
        {
          error:
            "Forbidden: Only Risk Admins can run fault/failure simulations or inject weather trigger values.",
        },
        { status: 403 }
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
        { error: "Forbidden: You cannot evaluate another farmer's policy." },
        { status: 403 }
      );
    }

    let weatherTelemetry = null;
    let triggerValue: number | null = null;

    if (body.observedValue !== undefined && body.observedValue !== "") {
      const parsed = Number(body.observedValue);
      if (Number.isNaN(parsed) || parsed < 0) {
        return NextResponse.json(
          { error: "Observed weather value must be a valid non-negative number." },
          { status: 400 }
        );
      }
      triggerValue = parsed;
    } else {
      // A06 Resilient Weather Fetch
      const weatherResult = await fetchWeatherWithResilience(
        policy.farm.latitude,
        policy.farm.longitude,
        currentUser.role === "ADMIN"
          ? {
              simulateTimeout: Boolean(body.forceApiTimeout),
              simulateMalformedJson: Boolean(body.simulateMalformedJson),
              forceOffline: Boolean(body.forceOffline),
            }
          : {}
      );
      weatherTelemetry = {
        source: weatherResult.source,
        attempts: weatherResult.attempts,
        totalDurationMs: weatherResult.totalDurationMs,
        warningBanner: weatherResult.warningBanner,
        reading: weatherResult.reading,
      };
      triggerValue = getObservedMetricValue(policy.metricType, weatherResult.reading);
    }

    if (triggerValue === null) {
      return NextResponse.json(
        { error: "Unable to resolve observed weather value for this policy." },
        { status: 400 }
      );
    }

    // A07 Multi-Step Parametric Workflow State Machine
    const result = await executeParametricClaimWorkflow({
      policyId: policy.id,
      triggerValue,
      simulateStep4Failure:
        currentUser.role === "ADMIN" && Boolean(body.forceSimulatedFailure),
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
        ...result,
        weatherTelemetry,
      },
      { status: statusCode }
    );
  } catch (error) {
    console.error("POST /api/weather/evaluate error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to run parametric weather evaluation.",
      },
      { status: 500 }
    );
  }
}
