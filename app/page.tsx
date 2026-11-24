import prisma from "@/lib/prisma";
import { getServerSessionUser } from "@/lib/auth-server";
import {
  evaluatePolicyRisk,
  extractBangladeshDistrict,
  getObservedMetricValue,
  parseWeatherPayload,
} from "@/lib/domain";
import { OverviewClient } from "@/components/OverviewClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const currentUser = await getServerSessionUser();
  const isAdmin = currentUser.role === "ADMIN";

  const [farms, policies, claims, weatherCaches] = await Promise.all([
    prisma.farm.findMany({
      where: isAdmin ? undefined : { userId: currentUser.id },
      select: { id: true, name: true, latitude: true, longitude: true },
    }),
    prisma.policy.findMany({
      where: isAdmin ? undefined : { farm: { userId: currentUser.id } },
      include: {
        farm: {
          select: {
            id: true,
            name: true,
            cropType: true,
            sizeHectares: true,
            latitude: true,
            longitude: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.claim.findMany({
      where: isAdmin ? undefined : { policy: { farm: { userId: currentUser.id } } },
      select: { id: true, status: true, payoutAmount: true },
    }),
    prisma.weatherCache.findMany({
      orderBy: { fetchedAt: "desc" },
    }),
  ]);

  const weatherByCoord = new Map<string, ReturnType<typeof parseWeatherPayload>>();
  for (const cache of weatherCaches) {
    const key = `${cache.latitude.toFixed(2)},${cache.longitude.toFixed(2)}`;
    if (!weatherByCoord.has(key)) {
      weatherByCoord.set(key, parseWeatherPayload(cache.weatherData));
    }
  }

  const districtSet = new Set(
    farms.map((f) => extractBangladeshDistrict(f.name, f.latitude, f.longitude))
  );

  const activePolicies = policies.filter((p) => p.status === "ACTIVE");
  let alertCount = 0;
  for (const policy of activePolicies) {
    const key = `${policy.farm.latitude.toFixed(2)},${policy.farm.longitude.toFixed(2)}`;
    const reading = weatherByCoord.get(key) ?? null;
    const observed = getObservedMetricValue(policy.metricType, reading);
    const { riskLevel } = evaluatePolicyRisk(policy.status, policy.thresholdValue, observed);
    if (riskLevel === "AT_RISK" || riskLevel === "BREACHED") {
      alertCount += 1;
    }
  }

  const totalCoverage = activePolicies.reduce((sum, p) => sum + p.coverageAmount, 0);
  const totalPayouts = claims
    .filter((c) => c.status === "DISBURSED")
    .reduce((sum, c) => sum + c.payoutAmount, 0);

  return (
    <OverviewClient
      currentUser={{
        name: currentUser.name,
        role: currentUser.role,
        balance: currentUser.balance,
        payoutMethod: currentUser.payoutMethod,
        mobileNumber: currentUser.mobileNumber,
      }}
      farmsCount={farms.length}
      districtsCount={districtSet.size}
      alertCount={alertCount}
      activePoliciesCount={activePolicies.length}
      totalPoliciesCount={policies.length}
      totalCoverage={totalCoverage}
      totalPayouts={totalPayouts}
      claimsCount={claims.length}
      weatherCacheCount={weatherCaches.length}
      policies={policies.map((p) => ({
        id: p.id,
        metricType: p.metricType,
        thresholdValue: p.thresholdValue,
        coverageAmount: p.coverageAmount,
        status: p.status,
        farm: p.farm,
      }))}
    />
  );
}
