import { PrismaClient, Role, PolicyStatus, PayoutMethod } from "@prisma/client";

const prisma = new PrismaClient();

export const SEED_IDS = {
  users: {
    admin: "user-admin-1",
    farmer1: "user-farmer-1",
    farmer2: "user-farmer-2",
  },
  farms: {
    sunamganj: "farm-sunamganj-haor",
    kurigram: "farm-kurigram-char",
    bogura: "farm-bogura-potato",
    satkhira: "farm-satkhira-coastal",
    rajshahi: "farm-rajshahi-barind",
  },
  policies: {
    sunamganjFlood: "policy-sunamganj-flood",
    kurigramMonsoon: "policy-kurigram-monsoon",
    boguraRain: "policy-bogura-rain",
    satkhiraCyclone: "policy-satkhira-cyclone",
    rajshahiHeat: "policy-rajshahi-heat",
    rajshahiDrought: "policy-rajshahi-drought",
  },
  weatherCache: {
    sunamganj: "cache-sunamganj-haor",
    kurigram: "cache-kurigram-char",
    bogura: "cache-bogura-potato",
    satkhira: "cache-satkhira-coastal",
    rajshahi: "cache-rajshahi-barind",
  },
} as const;

async function main() {
  console.log("Seeding WeatherShield Bangladesh dataset with MFS wallets into PostgreSQL...");

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const oneFiftyDaysAhead = new Date(now.getTime() + 150 * 24 * 60 * 60 * 1000);

  await prisma.workflowLog.deleteMany({});
  await prisma.claim.deleteMany({});
  await prisma.policy.deleteMany({});
  await prisma.farm.deleteMany({});
  await prisma.weatherCache.deleteMany({});

  // 1. Seed 1 Risk Admin & 2 Bangladeshi Farmers with bKash / Nagad / Rocket wallets
  const admin = await prisma.user.upsert({
    where: { id: SEED_IDS.users.admin },
    update: {
      email: "abdul.karim@weathershield.bd",
      name: "Abdul Karim",
      role: Role.ADMIN,
      balance: 2500000.0,
      payoutMethod: PayoutMethod.ROCKET,
      mobileNumber: "+8801911223344",
    },
    create: {
      id: SEED_IDS.users.admin,
      email: "abdul.karim@weathershield.bd",
      name: "Abdul Karim",
      role: Role.ADMIN,
      balance: 2500000.0,
      payoutMethod: PayoutMethod.ROCKET,
      mobileNumber: "+8801911223344",
    },
  });

  const farmer1 = await prisma.user.upsert({
    where: { id: SEED_IDS.users.farmer1 },
    update: {
      email: "rokon.uddin@krishi.bd",
      name: "Rokon Uddin",
      role: Role.FARMER,
      balance: 12500.0,
      payoutMethod: PayoutMethod.BKASH,
      mobileNumber: "+8801712345678",
    },
    create: {
      id: SEED_IDS.users.farmer1,
      email: "rokon.uddin@krishi.bd",
      name: "Rokon Uddin",
      role: Role.FARMER,
      balance: 12500.0,
      payoutMethod: PayoutMethod.BKASH,
      mobileNumber: "+8801712345678",
    },
  });

  const farmer2 = await prisma.user.upsert({
    where: { id: SEED_IDS.users.farmer2 },
    update: {
      email: "fatima.begum@krishi.bd",
      name: "Fatima Begum",
      role: Role.FARMER,
      balance: 18000.0,
      payoutMethod: PayoutMethod.NAGAD,
      mobileNumber: "+8801819876543",
    },
    create: {
      id: SEED_IDS.users.farmer2,
      email: "fatima.begum@krishi.bd",
      name: "Fatima Begum",
      role: Role.FARMER,
      balance: 18000.0,
      payoutMethod: PayoutMethod.NAGAD,
      mobileNumber: "+8801819876543",
    },
  });

  // 2. Seed 5 Farm Plots across Climate-Vulnerable Bangladesh Districts
  const farms = [
    {
      id: SEED_IDS.farms.sunamganj,
      name: "Tahirpur Haor Boro Plot (Sunamganj)",
      latitude: 25.0658,
      longitude: 91.395,
      cropType: "Boro Rice",
      sizeHectares: 0.8027,
      userId: farmer1.id,
    },
    {
      id: SEED_IDS.farms.kurigram,
      name: "Chilmari Riverine Char Farm (Kurigram)",
      latitude: 25.8054,
      longitude: 89.6362,
      cropType: "Jute / Aman Paddy",
      sizeHectares: 1.204,
      userId: farmer1.id,
    },
    {
      id: SEED_IDS.farms.bogura,
      name: "Sherpur Alluvial Potato Field (Bogura)",
      latitude: 24.8465,
      longitude: 89.3773,
      cropType: "Potato / Rice",
      sizeHectares: 0.6689,
      userId: farmer1.id,
    },
    {
      id: SEED_IDS.farms.satkhira,
      name: "Shyamnagar Coastal Gher & Paddy (Satkhira)",
      latitude: 22.7185,
      longitude: 89.0705,
      cropType: "Aman Paddy / Shrimp Aquaculture",
      sizeHectares: 1.6054,
      userId: farmer2.id,
    },
    {
      id: SEED_IDS.farms.rajshahi,
      name: "Godagari Barind Mango & Wheat (Rajshahi)",
      latitude: 24.3745,
      longitude: 88.6042,
      cropType: "Mango / Wheat",
      sizeHectares: 1.0702,
      userId: farmer2.id,
    },
  ];

  await prisma.farm.createMany({ data: farms });

  // 3. Seed 6 Active Parametric Micro-Insurance Policies aligned with Tiered Rules
  // Moderate: Rainfall 50-99mm (50%), Temp 38-41.9°C (50%)
  // Severe: Rainfall >= 100mm (100%), Temp >= 42°C (100%)
  const policies = [
    {
      id: SEED_IDS.policies.sunamganjFlood,
      farmId: SEED_IDS.farms.sunamganj,
      metricType: "RAINFALL_MAX",
      thresholdValue: 50.0, // Moderate 50–99mm (50%) | Severe >=100mm (100%)
      coverageAmount: 30000.0,
      premiumPaid: 1800.0,
      startDate: thirtyDaysAgo,
      endDate: oneFiftyDaysAhead,
      status: PolicyStatus.ACTIVE,
    },
    {
      id: SEED_IDS.policies.kurigramMonsoon,
      farmId: SEED_IDS.farms.kurigram,
      metricType: "RAINFALL_MAX",
      thresholdValue: 60.0, // Moderate 60–99mm (50%) | Severe >=100mm (100%)
      coverageAmount: 22000.0,
      premiumPaid: 1320.0,
      startDate: thirtyDaysAgo,
      endDate: oneFiftyDaysAhead,
      status: PolicyStatus.ACTIVE,
    },
    {
      id: SEED_IDS.policies.boguraRain,
      farmId: SEED_IDS.farms.bogura,
      metricType: "RAINFALL_MAX",
      thresholdValue: 50.0, // Moderate 50–99mm (50%) | Severe >=100mm (100%)
      coverageAmount: 15000.0,
      premiumPaid: 900.0,
      startDate: thirtyDaysAgo,
      endDate: oneFiftyDaysAhead,
      status: PolicyStatus.ACTIVE,
    },
    {
      id: SEED_IDS.policies.satkhiraCyclone,
      farmId: SEED_IDS.farms.satkhira,
      metricType: "RAINFALL_MAX",
      thresholdValue: 65.0, // Moderate 65–99mm (50%) | Severe >=100mm (100%)
      coverageAmount: 45000.0,
      premiumPaid: 2700.0,
      startDate: thirtyDaysAgo,
      endDate: oneFiftyDaysAhead,
      status: PolicyStatus.ACTIVE,
    },
    {
      id: SEED_IDS.policies.rajshahiHeat,
      farmId: SEED_IDS.farms.rajshahi,
      metricType: "TEMP_MAX",
      thresholdValue: 38.0, // Moderate 38–41.9°C (50%) | Severe >=42°C (100%)
      coverageAmount: 25000.0,
      premiumPaid: 1500.0,
      startDate: thirtyDaysAgo,
      endDate: oneFiftyDaysAhead,
      status: PolicyStatus.ACTIVE,
    },
    {
      id: SEED_IDS.policies.rajshahiDrought,
      farmId: SEED_IDS.farms.rajshahi,
      metricType: "DROUGHT_DAYS",
      thresholdValue: 14.0, // Moderate 14–20 days (50%) | Severe >=21 days (100%)
      coverageAmount: 18000.0,
      premiumPaid: 1080.0,
      startDate: thirtyDaysAgo,
      endDate: oneFiftyDaysAhead,
      status: PolicyStatus.ACTIVE,
    },
  ];

  await prisma.policy.createMany({ data: policies });

  // 4. Seed rich 7-day baseline WeatherCache snapshots (Asia/Dhaka timezone)
  // Covers all 3 pin states on initial load:
  // - Sunamganj: 56.4mm vs 50mm threshold -> RED (Breached)
  // - Satkhira: 58.5mm vs 65mm threshold (90%) -> AMBER (Warning within 15%)
  // - Rajshahi: 36.4°C vs 38°C threshold (95.8%) -> AMBER (Warning within 15%)
  // - Kurigram: 34.2mm vs 60mm threshold (57%) -> GREEN (Safe)
  // - Bogura: 18.6mm vs 50mm threshold (37%) -> GREEN (Safe)
  const sevenDates = Array.from({ length: 7 }, (_, i) =>
    new Date(now.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );

  const weatherSnapshots = [
    {
      id: SEED_IDS.weatherCache.sunamganj,
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
      id: SEED_IDS.weatherCache.kurigram,
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
      id: SEED_IDS.weatherCache.bogura,
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
      id: SEED_IDS.weatherCache.satkhira,
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
      id: SEED_IDS.weatherCache.rajshahi,
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
  ];

  await prisma.weatherCache.createMany({ data: weatherSnapshots });

  console.log("Bangladesh MFS seed completed successfully:");
  console.log(`  - Admin: ${admin.name} (${admin.payoutMethod} ${admin.mobileNumber})`);
  console.log(
    `  - Farmers: ${farmer1.name} (${farmer1.payoutMethod} ${farmer1.mobileNumber}), ${farmer2.name} (${farmer2.payoutMethod} ${farmer2.mobileNumber})`
  );
  console.log(`  - Farms: ${farms.length}, Active Policies: ${policies.length}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Failed to seed database:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
