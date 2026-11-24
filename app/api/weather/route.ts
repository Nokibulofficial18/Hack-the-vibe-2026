import { NextResponse } from "next/server";
import { ClaimStatus, PolicyStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { canAccessResource, getServerSessionUser } from "@/lib/auth-server";
import {
  evaluatePolicyRisk,
  extractBangladeshDistrict,
  getObservedMetricValue,
} from "@/lib/domain";
import { getWeatherFromCache } from "@/lib/cache";
import {
  fetchWeatherWithResilience,
  type WeatherSimulateOptions,
} from "@/lib/weatherResilience";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const currentUser = await getServerSessionUser(request);

    const [farms, disbursedClaims] = await Promise.all([
      prisma.farm.findMany({
        where: currentUser.role === "ADMIN" ? undefined : { userId: currentUser.id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              payoutMethod: true,
              mobileNumber: true,
            },
          },
          policies: {
            include: {
              claims: {
                select: {
                  id: true,
                  status: true,
                  payoutAmount: true,
                  severityTier: true,
                  transactionId: true,
                  createdAt: true,
                },
                orderBy: { createdAt: "desc" },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.claim.findMany({
        where:
          currentUser.role === "ADMIN"
            ? { status: ClaimStatus.DISBURSED }
            : {
                status: ClaimStatus.DISBURSED,
                policy: { farm: { userId: currentUser.id } },
              },
        select: { id: true, payoutAmount: true },
      }),
    ]);

    const monitoredFarms = await Promise.all(
      farms.map(async (farm) => {
        const cached = await getWeatherFromCache(farm.latitude, farm.longitude);
        const reading = cached?.reading ?? null;
        const district = extractBangladeshDistrict(farm.name, farm.latitude, farm.longitude);

        const evaluatedPolicies = farm.policies.map((policy) => {
          const observedValue = getObservedMetricValue(policy.metricType, reading);
          const { riskLevel, ratio } = evaluatePolicyRisk(
            policy.status,
            policy.thresholdValue,
            observedValue
          );

          return {
            ...policy,
            observedValue,
            riskLevel,
            ratio: Number(ratio.toFixed(2)),
          };
        });

        const hasBreachOrClaimed = evaluatedPolicies.some(
          (p) => p.riskLevel === "BREACHED" || p.riskLevel === "CLAIMED"
        );
        const hasWarning = evaluatedPolicies.some((p) => p.riskLevel === "AT_RISK");
        const pinStatus: "BREACHED" | "WARNING" | "SAFE" = hasBreachOrClaimed
          ? "BREACHED"
          : hasWarning
            ? "WARNING"
            : "SAFE";

        const activeCoverage = evaluatedPolicies
          .filter((p) => p.status === PolicyStatus.ACTIVE)
          .reduce((sum, p) => sum + p.coverageAmount, 0);

        const farmPayouts = evaluatedPolicies.reduce(
          (sum, p) =>
            sum +
            p.claims
              .filter((c) => c.status === ClaimStatus.DISBURSED)
              .reduce((cSum, c) => cSum + c.payoutAmount, 0),
          0
        );

        return {
          ...farm,
          district,
          pinStatus,
          activeCoverage: Math.round(activeCoverage * 100) / 100,
          totalPayouts: Math.round(farmPayouts * 100) / 100,
          policies: evaluatedPolicies,
          weather: reading,
          lastFetchedAt: cached?.fetchedAt ?? null,
          cacheAgeMinutes: cached?.ageMinutes ?? null,
          dataSource: cached ? "CACHED_SNAPSHOT" : "UNSYNCED",
          farmStatus: hasBreachOrClaimed
            ? "TRIGGER_BREACHED"
            : hasWarning
              ? "ELEVATED_RISK"
              : "NORMAL",
        };
      })
    );

    // Aggregate KPI calculations (M05)
    const allPolicies = monitoredFarms.flatMap((f) => f.policies);
    const activePolicies = allPolicies.filter((p) => p.status === PolicyStatus.ACTIVE);
    const riskTriggeredPolicies = activePolicies.filter(
      (p) => p.riskLevel === "AT_RISK" || p.riskLevel === "BREACHED"
    );
    const healthyPolicies = activePolicies.filter((p) => p.riskLevel === "HEALTHY");

    const totalLiability =
      Math.round(activePolicies.reduce((sum, p) => sum + p.coverageAmount, 0) * 100) / 100;
    const totalPayoutsIssued =
      Math.round(disbursedClaims.reduce((sum, c) => sum + c.payoutAmount, 0) * 100) / 100;
    const activeRiskExposure =
      Math.round(
        riskTriggeredPolicies.reduce((sum, p) => sum + p.coverageAmount, 0) * 100
      ) / 100;

    // Aggregate District Coverage vs Payouts for Recharts Bar Chart
    const districtMap = new Map<
      string,
      {
        district: string;
        coverage: number;
        payouts: number;
        farmCount: number;
        policyCount: number;
        riskStatus: "SAFE" | "WARNING" | "BREACHED";
      }
    >();

    for (const farm of monitoredFarms) {
      const existing = districtMap.get(farm.district) ?? {
        district: farm.district,
        coverage: 0,
        payouts: 0,
        farmCount: 0,
        policyCount: 0,
        riskStatus: "SAFE" as const,
      };

      const totalFarmCoverage = farm.policies.reduce((s, p) => s + p.coverageAmount, 0);
      existing.coverage = Math.round((existing.coverage + totalFarmCoverage) * 100) / 100;
      existing.payouts = Math.round((existing.payouts + farm.totalPayouts) * 100) / 100;
      existing.farmCount += 1;
      existing.policyCount += farm.policies.length;

      if (
        farm.pinStatus === "BREACHED" ||
        (farm.pinStatus === "WARNING" && existing.riskStatus === "SAFE")
      ) {
        existing.riskStatus = farm.pinStatus;
      }

      districtMap.set(farm.district, existing);
    }

    const byDistrict = Array.from(districtMap.values()).sort(
      (a, b) => b.coverage - a.coverage
    );

    return NextResponse.json({
      farms: monitoredFarms,
      currentUser,
      scope: currentUser.role === "ADMIN" ? "GLOBAL" : "USER_ISOLATED",
      kpis: {
        totalLiability,
        totalPayoutsIssued,
        disbursedClaimsCount: disbursedClaims.length,
        activeRiskExposure,
        activePoliciesCount: activePolicies.length,
        healthyPoliciesCount: healthyPolicies.length,
        atRiskPoliciesCount: activePolicies.filter((p) => p.riskLevel === "AT_RISK").length,
        breachedPoliciesCount: activePolicies.filter((p) => p.riskLevel === "BREACHED").length,
        monitoredFarmsCount: monitoredFarms.length,
      },
      charts: {
        byDistrict,
      },
    });
  } catch (error) {
    console.error("GET /api/weather error:", error);
    return NextResponse.json(
      { error: "Failed to load weather monitoring dashboard." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await getServerSessionUser(request);
    const body = (await request.json().catch(() => ({}))) as {
      farmId?: string;
      simulateOptions?: WeatherSimulateOptions;
    };

    const requestedSim = body.simulateOptions ?? {};
    const hasFaultInjection = Boolean(
      requestedSim.simulateTimeout ||
        requestedSim.simulateMalformedJson ||
        requestedSim.forceOffline
    );

    if (hasFaultInjection && currentUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Only Risk Admins can activate API fault injection controls." },
        { status: 403 }
      );
    }

    const safeSimulateOptions: WeatherSimulateOptions =
      currentUser.role === "ADMIN"
        ? {
            simulateTimeout: Boolean(requestedSim.simulateTimeout),
            simulateMalformedJson: Boolean(requestedSim.simulateMalformedJson),
            forceOffline: Boolean(requestedSim.forceOffline),
            ...(typeof requestedSim.timeoutMs === "number" &&
            requestedSim.timeoutMs >= 50 &&
            requestedSim.timeoutMs <= 10000
              ? { timeoutMs: requestedSim.timeoutMs }
              : {}),
            ...(typeof requestedSim.maxRetries === "number" &&
            requestedSim.maxRetries >= 1 &&
            requestedSim.maxRetries <= 5
              ? { maxRetries: requestedSim.maxRetries }
              : {}),
          }
        : {};

    let targetFarms = [];

    if (body.farmId) {
      const farm = await prisma.farm.findUnique({ where: { id: body.farmId } });
      if (!farm) {
        return NextResponse.json({ error: "Farm not found." }, { status: 404 });
      }
      if (!canAccessResource(currentUser, farm.userId)) {
        return NextResponse.json(
          { error: "Forbidden: Cannot sync weather for another farmer's plot." },
          { status: 403 }
        );
      }
      targetFarms = [farm];
    } else {
      targetFarms = await prisma.farm.findMany({
        where: currentUser.role === "ADMIN" ? undefined : { userId: currentUser.id },
      });
    }

    const syncResults = await Promise.all(
      targetFarms.map(async (farm) => {
        try {
          const resilient = await fetchWeatherWithResilience(
            farm.latitude,
            farm.longitude,
            safeSimulateOptions
          );

          return {
            farmId: farm.id,
            farmName: farm.name,
            source: resilient.source,
            attempts: resilient.attempts,
            totalDurationMs: resilient.totalDurationMs,
            fetchedAt: resilient.fetchedAt,
            cacheAgeMinutes: resilient.cacheAgeMinutes,
            warningBanner: resilient.warningBanner,
            errorSummary: resilient.errorSummary,
            rateLimitRemaining: resilient.rateLimitRemaining,
            reading: resilient.reading,
            attemptLogs: resilient.attemptLogs,
          };
        } catch (err) {
          return {
            farmId: farm.id,
            farmName: farm.name,
            source: "FAILED" as const,
            attempts: safeSimulateOptions.maxRetries ?? 3,
            totalDurationMs: 0,
            fetchedAt: null,
            cacheAgeMinutes: null,
            warningBanner:
              err instanceof Error
                ? `External API failed and no cached snapshot exists (${err.message}).`
                : "External API failed and no cached snapshot exists.",
            errorSummary: err instanceof Error ? err.message : "API_AND_CACHE_FAILED",
            rateLimitRemaining: 0,
            reading: null,
            attemptLogs: [],
          };
        }
      })
    );

    return NextResponse.json({
      syncedAt: new Date().toISOString(),
      simulateOptions: safeSimulateOptions,
      results: syncResults,
    });
  } catch (error) {
    console.error("POST /api/weather error:", error);
    return NextResponse.json(
      { error: "Failed to execute resilient weather sync." },
      { status: 500 }
    );
  }
}
