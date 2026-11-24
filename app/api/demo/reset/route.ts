import { NextResponse } from "next/server";
import { PayoutMethod, PolicyStatus, Role } from "@prisma/client";
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

    await prisma.$transaction(async (tx) => {
      await tx.workflowLog.deleteMany({});
      await tx.claim.deleteMany({});
      await tx.policy.deleteMany({});
      await tx.farm.deleteMany({});
      await tx.weatherCache.deleteMany({});

      await tx.user.upsert({
        where: { id: "user-admin-1" },
        update: {
          email: "abdul.karim@weathershield.bd",
          name: "Abdul Karim",
          role: Role.ADMIN,
          balance: 2500000.0,
          payoutMethod: PayoutMethod.ROCKET,
          mobileNumber: "+8801911223344",
        },
        create: {
          id: "user-admin-1",
          email: "abdul.karim@weathershield.bd",
          name: "Abdul Karim",
          role: Role.ADMIN,
          balance: 2500000.0,
          payoutMethod: PayoutMethod.ROCKET,
          mobileNumber: "+8801911223344",
        },
      });

      await tx.user.upsert({
        where: { id: "user-farmer-1" },
        update: {
          email: "rokon.uddin@krishi.bd",
          name: "Rokon Uddin",
          role: Role.FARMER,
          balance: 12500.0,
          payoutMethod: PayoutMethod.BKASH,
          mobileNumber: "+8801712345678",
        },
        create: {
          id: "user-farmer-1",
          email: "rokon.uddin@krishi.bd",
          name: "Rokon Uddin",
          role: Role.FARMER,
          balance: 12500.0,
          payoutMethod: PayoutMethod.BKASH,
          mobileNumber: "+8801712345678",
        },
      });

      await tx.user.upsert({
        where: { id: "user-farmer-2" },
        update: {
          email: "fatima.begum@krishi.bd",
          name: "Fatima Begum",
          role: Role.FARMER,
          balance: 18000.0,
          payoutMethod: PayoutMethod.NAGAD,
          mobileNumber: "+8801819876543",
        },
        create: {
          id: "user-farmer-2",
          email: "fatima.begum@krishi.bd",
          name: "Fatima Begum",
          role: Role.FARMER,
          balance: 18000.0,
          payoutMethod: PayoutMethod.NAGAD,
          mobileNumber: "+8801819876543",
        },
      });

      await tx.farm.createMany({
        data: [
          {
            id: "farm-sunamganj-haor",
            name: "Tahirpur Haor Boro Plot (Sunamganj)",
            latitude: 25.0658,
            longitude: 91.395,
            cropType: "Boro Rice",
            sizeHectares: 0.8027,
            userId: "user-farmer-1",
          },
          {
            id: "farm-kurigram-char",
            name: "Chilmari Riverine Char Farm (Kurigram)",
            latitude: 25.8054,
            longitude: 89.6362,
            cropType: "Jute / Aman Paddy",
            sizeHectares: 1.204,
            userId: "user-farmer-1",
          },
          {
            id: "farm-bogura-potato",
            name: "Sherpur Alluvial Potato Field (Bogura)",
            latitude: 24.8465,
            longitude: 89.3773,
            cropType: "Potato / Rice",
            sizeHectares: 0.6689,
            userId: "user-farmer-1",
          },
          {
            id: "farm-satkhira-coastal",
            name: "Shyamnagar Coastal Gher & Paddy (Satkhira)",
            latitude: 22.7185,
            longitude: 89.0705,
            cropType: "Aman Paddy / Shrimp Aquaculture",
            sizeHectares: 1.6054,
            userId: "user-farmer-2",
          },
          {
            id: "farm-rajshahi-barind",
            name: "Godagari Barind Mango & Wheat (Rajshahi)",
            latitude: 24.3745,
            longitude: 88.6042,
            cropType: "Mango / Wheat",
            sizeHectares: 1.0702,
            userId: "user-farmer-2",
          },
        ],
      });

      await tx.policy.createMany({
        data: [
          {
            id: "policy-sunamganj-flood",
            farmId: "farm-sunamganj-haor",
            metricType: "RAINFALL_MAX",
            thresholdValue: 50.0,
            coverageAmount: 30000.0,
            premiumPaid: 1800.0,
            startDate: thirtyDaysAgo,
            endDate: oneFiftyDaysAhead,
            status: PolicyStatus.ACTIVE,
          },
          {
            id: "policy-kurigram-monsoon",
            farmId: "farm-kurigram-char",
            metricType: "RAINFALL_MAX",
            thresholdValue: 60.0,
            coverageAmount: 22000.0,
            premiumPaid: 1320.0,
            startDate: thirtyDaysAgo,
            endDate: oneFiftyDaysAhead,
            status: PolicyStatus.ACTIVE,
          },
          {
            id: "policy-bogura-rain",
            farmId: "farm-bogura-potato",
            metricType: "RAINFALL_MAX",
            thresholdValue: 50.0,
            coverageAmount: 15000.0,
            premiumPaid: 900.0,
            startDate: thirtyDaysAgo,
            endDate: oneFiftyDaysAhead,
            status: PolicyStatus.ACTIVE,
          },
          {
            id: "policy-satkhira-cyclone",
            farmId: "farm-satkhira-coastal",
            metricType: "RAINFALL_MAX",
            thresholdValue: 65.0,
            coverageAmount: 45000.0,
            premiumPaid: 2700.0,
            startDate: thirtyDaysAgo,
            endDate: oneFiftyDaysAhead,
            status: PolicyStatus.ACTIVE,
          },
          {
            id: "policy-rajshahi-heat",
            farmId: "farm-rajshahi-barind",
            metricType: "TEMP_MAX",
            thresholdValue: 38.0,
            coverageAmount: 25000.0,
            premiumPaid: 1500.0,
            startDate: thirtyDaysAgo,
            endDate: oneFiftyDaysAhead,
            status: PolicyStatus.ACTIVE,
          },
          {
            id: "policy-rajshahi-drought",
            farmId: "farm-rajshahi-barind",
            metricType: "DROUGHT_DAYS",
            thresholdValue: 14.0,
            coverageAmount: 18000.0,
            premiumPaid: 1080.0,
            startDate: thirtyDaysAgo,
            endDate: oneFiftyDaysAhead,
            status: PolicyStatus.ACTIVE,
          },
        ],
      });

      const sevenDates = Array.from({ length: 7 }, (_, i) =>
        new Date(now.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      );

      await tx.weatherCache.createMany({
        data: [
          {
            id: "cache-sunamganj-haor",
            latitude: 25.0658,
            longitude: 91.395,
            weatherData: JSON.stringify({
              latitude: 25.0658,
              longitude: 91.395,
              timezone: "Asia/Dhaka",
              daily: {
                time: sevenDates,
                rain_sum: [56.4, 44.0, 68.5, 38.2, 29.0, 48.5, 74.2],
                temperature_2m_max: [30.8, 31.2, 29.6, 31.5, 32.0, 30.4, 29.1],
              },
            }),
            fetchedAt: now,
          },
          {
            id: "cache-kurigram-char",
            latitude: 25.8054,
            longitude: 89.6362,
            weatherData: JSON.stringify({
              latitude: 25.8054,
              longitude: 89.6362,
              timezone: "Asia/Dhaka",
              daily: {
                time: sevenDates,
                rain_sum: [34.2, 28.0, 41.5, 22.0, 18.4, 31.0, 26.5],
                temperature_2m_max: [31.4, 32.1, 30.9, 32.5, 33.1, 31.8, 32.0],
              },
            }),
            fetchedAt: now,
          },
          {
            id: "cache-bogura-potato",
            latitude: 24.8465,
            longitude: 89.3773,
            weatherData: JSON.stringify({
              latitude: 24.8465,
              longitude: 89.3773,
              timezone: "Asia/Dhaka",
              daily: {
                time: sevenDates,
                rain_sum: [18.6, 12.4, 24.0, 15.2, 9.8, 21.5, 16.0],
                temperature_2m_max: [32.9, 33.4, 32.1, 33.8, 34.2, 33.0, 33.5],
              },
            }),
            fetchedAt: now,
          },
          {
            id: "cache-satkhira-coastal",
            latitude: 22.7185,
            longitude: 89.0705,
            weatherData: JSON.stringify({
              latitude: 22.7185,
              longitude: 89.0705,
              timezone: "Asia/Dhaka",
              daily: {
                time: sevenDates,
                rain_sum: [58.5, 49.2, 66.8, 41.0, 33.5, 52.0, 62.4],
                temperature_2m_max: [31.2, 31.6, 30.2, 32.0, 32.4, 31.1, 30.6],
              },
            }),
            fetchedAt: now,
          },
          {
            id: "cache-rajshahi-barind",
            latitude: 24.3745,
            longitude: 88.6042,
            weatherData: JSON.stringify({
              latitude: 24.3745,
              longitude: 88.6042,
              timezone: "Asia/Dhaka",
              daily: {
                time: sevenDates,
                rain_sum: [0.4, 0.0, 0.0, 0.2, 0.0, 1.4, 0.0],
                temperature_2m_max: [36.4, 37.5, 38.8, 40.1, 39.2, 37.4, 36.9],
              },
            }),
            fetchedAt: now,
          },
        ],
      });
    });

    return NextResponse.json({
      reset: true,
      message:
        "Restored Bangladesh MFS dataset: Rokon Uddin (bKash), Fatima Begum (Nagad), Abdul Karim (Rocket), 5 District Farms, and 6 Active Policies.",
    });
  } catch (error) {
    console.error("POST /api/demo/reset error:", error);
    return NextResponse.json(
      { error: "Failed to reset demo dataset." },
      { status: 500 }
    );
  }
}
