import { PrismaClient, Role, PolicyStatus } from "@prisma/client";

const prisma = new PrismaClient();

export const SEED_IDS = {
  users: {
    admin: "user-admin-1",
    farmer1: "user-farmer-1",
    farmer2: "user-farmer-2",
  },
  farms: {
    luzonRice: "farm-luzon-rice",
    mindanaoCorn: "farm-mindanao-corn",
    keralaSpice: "farm-kerala-spice",
  },
  policies: {
    luzonRainfall: "policy-luzon-rainfall",
    luzonHeat: "policy-luzon-heat",
    mindanaoDrought: "policy-mindanao-drought",
    keralaMonsoon: "policy-kerala-monsoon",
  },
  weatherCache: {
    luzon: "cache-luzon-rice",
    mindanao: "cache-mindanao-corn",
    kerala: "cache-kerala-spice",
  },
} as const;

async function main() {
  console.log("Seeding WeatherShield PostgreSQL database...");

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const oneFiftyDaysAhead = new Date(now.getTime() + 150 * 24 * 60 * 60 * 1000);

  // 1. Seed 1 Admin & 2 Farmers
  const admin = await prisma.user.upsert({
    where: { email: "admin@weathershield.io" },
    update: {
      name: "Elena Rostova",
      role: Role.ADMIN,
      balance: 250000.0,
    },
    create: {
      id: SEED_IDS.users.admin,
      email: "admin@weathershield.io",
      name: "Elena Rostova",
      role: Role.ADMIN,
      balance: 250000.0, // Insurer liquidity reserve pool
    },
  });

  const farmer1 = await prisma.user.upsert({
    where: { email: "farmer@example.com" },
    update: {
      name: "Mateo Santos",
      role: Role.FARMER,
      balance: 450.0,
    },
    create: {
      id: SEED_IDS.users.farmer1,
      email: "farmer@example.com",
      name: "Mateo Santos",
      role: Role.FARMER,
      balance: 450.0,
    },
  });

  const farmer2 = await prisma.user.upsert({
    where: { email: "priya.nair@weathershield.io" },
    update: {
      name: "Priya Nair",
      role: Role.FARMER,
      balance: 620.0,
    },
    create: {
      id: SEED_IDS.users.farmer2,
      email: "priya.nair@weathershield.io",
      name: "Priya Nair",
      role: Role.FARMER,
      balance: 620.0,
    },
  });

  // 2. Seed 3 Farms (2 for Farmer 1, 1 for Farmer 2)
  const farm1 = await prisma.farm.upsert({
    where: { id: SEED_IDS.farms.luzonRice },
    update: {
      name: "Luzon Valley Rice Co-op",
      latitude: 14.5995,
      longitude: 120.9842,
      cropType: "Irrigated Rice",
      sizeHectares: 4.5,
      userId: farmer1.id,
    },
    create: {
      id: SEED_IDS.farms.luzonRice,
      name: "Luzon Valley Rice Co-op",
      latitude: 14.5995,
      longitude: 120.9842,
      cropType: "Irrigated Rice",
      sizeHectares: 4.5,
      userId: farmer1.id,
    },
  });

  const farm2 = await prisma.farm.upsert({
    where: { id: SEED_IDS.farms.mindanaoCorn },
    update: {
      name: "Bukidnon Highland Maize",
      latitude: 8.0515,
      longitude: 125.0942,
      cropType: "Sweet Corn",
      sizeHectares: 3.2,
      userId: farmer1.id,
    },
    create: {
      id: SEED_IDS.farms.mindanaoCorn,
      name: "Bukidnon Highland Maize",
      latitude: 8.0515,
      longitude: 125.0942,
      cropType: "Sweet Corn",
      sizeHectares: 3.2,
      userId: farmer1.id,
    },
  });

  const farm3 = await prisma.farm.upsert({
    where: { id: SEED_IDS.farms.keralaSpice },
    update: {
      name: "Wayanad Emerald Spice Plot",
      latitude: 11.6854,
      longitude: 76.132,
      cropType: "Black Pepper & Coffee",
      sizeHectares: 5.8,
      userId: farmer2.id,
    },
    create: {
      id: SEED_IDS.farms.keralaSpice,
      name: "Wayanad Emerald Spice Plot",
      latitude: 11.6854,
      longitude: 76.132,
      cropType: "Black Pepper & Coffee",
      sizeHectares: 5.8,
      userId: farmer2.id,
    },
  });

  // 3. Seed 4 Active Parametric Policies across the 3 Farms
  const policies = [
    {
      id: SEED_IDS.policies.luzonRainfall,
      farmId: farm1.id,
      metricType: "RAINFALL_MAX",
      thresholdValue: 50.0, // mm/day heavy rainfall trigger
      coverageAmount: 1500.0,
      premiumPaid: 95.0,
      startDate: thirtyDaysAgo,
      endDate: oneFiftyDaysAhead,
      status: PolicyStatus.ACTIVE,
    },
    {
      id: SEED_IDS.policies.luzonHeat,
      farmId: farm1.id,
      metricType: "TEMP_MAX",
      thresholdValue: 38.0, // °C extreme heat trigger
      coverageAmount: 1000.0,
      premiumPaid: 60.0,
      startDate: thirtyDaysAgo,
      endDate: oneFiftyDaysAhead,
      status: PolicyStatus.ACTIVE,
    },
    {
      id: SEED_IDS.policies.mindanaoDrought,
      farmId: farm2.id,
      metricType: "DROUGHT_DAYS",
      thresholdValue: 14.0, // consecutive dry days trigger
      coverageAmount: 1200.0,
      premiumPaid: 75.0,
      startDate: thirtyDaysAgo,
      endDate: oneFiftyDaysAhead,
      status: PolicyStatus.ACTIVE,
    },
    {
      id: SEED_IDS.policies.keralaMonsoon,
      farmId: farm3.id,
      metricType: "RAINFALL_MAX",
      thresholdValue: 80.0, // mm/day monsoon flood trigger
      coverageAmount: 2200.0,
      premiumPaid: 140.0,
      startDate: thirtyDaysAgo,
      endDate: oneFiftyDaysAhead,
      status: PolicyStatus.ACTIVE,
    },
  ];

  for (const policy of policies) {
    await prisma.policy.upsert({
      where: { id: policy.id },
      update: {
        farmId: policy.farmId,
        metricType: policy.metricType,
        thresholdValue: policy.thresholdValue,
        coverageAmount: policy.coverageAmount,
        premiumPaid: policy.premiumPaid,
        startDate: policy.startDate,
        endDate: policy.endDate,
        status: policy.status,
      },
      create: policy,
    });
  }

  // 4. Seed baseline WeatherCache snapshots so fallback cache is warm on first boot
  const todayIso = now.toISOString().split("T")[0];
  const weatherSnapshots = [
    {
      id: SEED_IDS.weatherCache.luzon,
      latitude: farm1.latitude,
      longitude: farm1.longitude,
      weatherData: JSON.stringify({
        latitude: farm1.latitude,
        longitude: farm1.longitude,
        timezone: "Asia/Manila",
        daily: {
          time: [todayIso],
          rain_sum: [18.4],
          temperature_2m_max: [33.2],
        },
      }),
    },
    {
      id: SEED_IDS.weatherCache.mindanao,
      latitude: farm2.latitude,
      longitude: farm2.longitude,
      weatherData: JSON.stringify({
        latitude: farm2.latitude,
        longitude: farm2.longitude,
        timezone: "Asia/Manila",
        daily: {
          time: [todayIso],
          rain_sum: [2.1],
          temperature_2m_max: [31.6],
        },
      }),
    },
    {
      id: SEED_IDS.weatherCache.kerala,
      latitude: farm3.latitude,
      longitude: farm3.longitude,
      weatherData: JSON.stringify({
        latitude: farm3.latitude,
        longitude: farm3.longitude,
        timezone: "Asia/Kolkata",
        daily: {
          time: [todayIso],
          rain_sum: [42.0],
          temperature_2m_max: [29.4],
        },
      }),
    },
  ];

  for (const snapshot of weatherSnapshots) {
    await prisma.weatherCache.upsert({
      where: { id: snapshot.id },
      update: {
        weatherData: snapshot.weatherData,
        fetchedAt: now,
      },
      create: {
        ...snapshot,
        fetchedAt: now,
      },
    });
  }

  console.log("Seed completed successfully:");
  console.log(`  - Users: 1 Admin (${admin.email}), 2 Farmers (${farmer1.email}, ${farmer2.email})`);
  console.log(`  - Farms: 3 (${farm1.name}, ${farm2.name}, ${farm3.name})`);
  console.log(`  - Active Parametric Policies: ${policies.length}`);
  console.log(`  - WeatherCache Snapshots: ${weatherSnapshots.length}`);
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
