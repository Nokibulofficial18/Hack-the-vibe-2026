import { NextResponse } from "next/server";
import { PolicyStatus, Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getServerSessionUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const currentUser = await getServerSessionUser(request);
    if (currentUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Only Risk Admins can reset demo data." },
        { status: 403 }
      );
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneFiftyDaysAhead = new Date(now.getTime() + 150 * 24 * 60 * 60 * 1000);
    const todayIso = now.toISOString().split("T")[0];

    await prisma.$transaction(async (tx) => {
      await tx.workflowLog.deleteMany({});
      await tx.claim.deleteMany({});
      await tx.policy.deleteMany({});
      await tx.farm.deleteMany({});
      await tx.weatherCache.deleteMany({});

      await tx.user.upsert({
        where: { email: "admin@weathershield.io" },
        update: { name: "Elena Rostova", role: Role.ADMIN, balance: 250000.0 },
        create: {
          id: "user-admin-1",
          email: "admin@weathershield.io",
          name: "Elena Rostova",
          role: Role.ADMIN,
          balance: 250000.0,
        },
      });

      await tx.user.upsert({
        where: { email: "farmer@example.com" },
        update: { name: "Mateo Santos", role: Role.FARMER, balance: 450.0 },
        create: {
          id: "user-farmer-1",
          email: "farmer@example.com",
          name: "Mateo Santos",
          role: Role.FARMER,
          balance: 450.0,
        },
      });

      await tx.user.upsert({
        where: { email: "priya.nair@weathershield.io" },
        update: { name: "Priya Nair", role: Role.FARMER, balance: 620.0 },
        create: {
          id: "user-farmer-2",
          email: "priya.nair@weathershield.io",
          name: "Priya Nair",
          role: Role.FARMER,
          balance: 620.0,
        },
      });

      await tx.farm.createMany({
        data: [
          {
            id: "farm-luzon-rice",
            name: "Luzon Valley Rice Co-op",
            latitude: 14.5995,
            longitude: 120.9842,
            cropType: "Irrigated Rice",
            sizeHectares: 4.5,
            userId: "user-farmer-1",
          },
          {
            id: "farm-mindanao-corn",
            name: "Bukidnon Highland Maize",
            latitude: 8.0515,
            longitude: 125.0942,
            cropType: "Sweet Corn",
            sizeHectares: 3.2,
            userId: "user-farmer-1",
          },
          {
            id: "farm-kerala-spice",
            name: "Wayanad Emerald Spice Plot",
            latitude: 11.6854,
            longitude: 76.132,
            cropType: "Black Pepper & Coffee",
            sizeHectares: 5.8,
            userId: "user-farmer-2",
          },
        ],
      });

      await tx.policy.createMany({
        data: [
          {
            id: "policy-luzon-rainfall",
            farmId: "farm-luzon-rice",
            metricType: "RAINFALL_MAX",
            thresholdValue: 50.0,
            coverageAmount: 1500.0,
            premiumPaid: 95.0,
            startDate: thirtyDaysAgo,
            endDate: oneFiftyDaysAhead,
            status: PolicyStatus.ACTIVE,
          },
          {
            id: "policy-luzon-heat",
            farmId: "farm-luzon-rice",
            metricType: "TEMP_MAX",
            thresholdValue: 38.0,
            coverageAmount: 1000.0,
            premiumPaid: 60.0,
            startDate: thirtyDaysAgo,
            endDate: oneFiftyDaysAhead,
            status: PolicyStatus.ACTIVE,
          },
          {
            id: "policy-mindanao-drought",
            farmId: "farm-mindanao-corn",
            metricType: "DROUGHT_DAYS",
            thresholdValue: 14.0,
            coverageAmount: 1200.0,
            premiumPaid: 75.0,
            startDate: thirtyDaysAgo,
            endDate: oneFiftyDaysAhead,
            status: PolicyStatus.ACTIVE,
          },
          {
            id: "policy-kerala-monsoon",
            farmId: "farm-kerala-spice",
            metricType: "RAINFALL_MAX",
            thresholdValue: 80.0,
            coverageAmount: 2200.0,
            premiumPaid: 140.0,
            startDate: thirtyDaysAgo,
            endDate: oneFiftyDaysAhead,
            status: PolicyStatus.ACTIVE,
          },
        ],
      });

      await tx.weatherCache.createMany({
        data: [
          {
            id: "cache-luzon-rice",
            latitude: 14.5995,
            longitude: 120.9842,
            weatherData: JSON.stringify({
              latitude: 14.5995,
              longitude: 120.9842,
              timezone: "Asia/Manila",
              daily: { time: [todayIso], rain_sum: [18.4], temperature_2m_max: [33.2] },
            }),
            fetchedAt: now,
          },
          {
            id: "cache-mindanao-corn",
            latitude: 8.0515,
            longitude: 125.0942,
            weatherData: JSON.stringify({
              latitude: 8.0515,
              longitude: 125.0942,
              timezone: "Asia/Manila",
              daily: { time: [todayIso], rain_sum: [2.1], temperature_2m_max: [31.6] },
            }),
            fetchedAt: now,
          },
          {
            id: "cache-kerala-spice",
            latitude: 11.6854,
            longitude: 76.132,
            weatherData: JSON.stringify({
              latitude: 11.6854,
              longitude: 76.132,
              timezone: "Asia/Kolkata",
              daily: { time: [todayIso], rain_sum: [42.0], temperature_2m_max: [29.4] },
            }),
            fetchedAt: now,
          },
        ],
      });
    });

    return NextResponse.json({
      reset: true,
      message: "Restored 1 Admin, 2 Farmers, 3 Farms, 4 Active Policies, and 3 WeatherCache snapshots.",
    });
  } catch (error) {
    console.error("POST /api/demo/reset error:", error);
    return NextResponse.json(
      { error: "Failed to reset demo dataset." },
      { status: 500 }
    );
  }
}
