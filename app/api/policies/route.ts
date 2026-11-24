import { NextResponse } from "next/server";
import { PolicyStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { canAccessResource, getServerSessionUser } from "@/lib/auth-server";
import { validatePolicyPayload } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const currentUser = await getServerSessionUser(request);
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const metricType = searchParams.get("metricType");

    const where: Record<string, unknown> = {};
    if (currentUser.role !== "ADMIN") {
      where.farm = { userId: currentUser.id };
    }
    if (statusParam && statusParam !== "ALL") {
      where.status = statusParam as PolicyStatus;
    }
    if (metricType && metricType !== "ALL") {
      where.metricType = metricType;
    }

    const policies = await prisma.policy.findMany({
      where,
      include: {
        farm: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        claims: {
          select: {
            id: true,
            status: true,
            payoutAmount: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      policies,
      currentUser,
      scope: currentUser.role === "ADMIN" ? "GLOBAL" : "USER_ISOLATED",
    });
  } catch (error) {
    console.error("GET /api/policies error:", error);
    return NextResponse.json(
      { error: "Failed to fetch parametric policies." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await getServerSessionUser(request);
    const body = (await request.json()) as {
      farmId?: string;
      metricType?: string;
      thresholdValue?: number | string;
      coverageAmount?: number | string;
      premiumPaid?: number | string;
      durationDays?: number | string;
    };

    const validation = validatePolicyPayload(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: validation.errors },
        { status: 400 }
      );
    }

    const farm = await prisma.farm.findUnique({
      where: { id: body.farmId! },
    });

    if (!farm) {
      return NextResponse.json({ error: "Selected farm plot not found." }, { status: 404 });
    }

    if (!canAccessResource(currentUser, farm.userId)) {
      return NextResponse.json(
        { error: "Forbidden: You cannot issue a policy for another farmer's plot." },
        { status: 403 }
      );
    }

    const durationDays = body.durationDays ? Number(body.durationDays) : 180;
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const policy = await prisma.policy.create({
      data: {
        farmId: farm.id,
        metricType: body.metricType!,
        thresholdValue: Number(body.thresholdValue),
        coverageAmount: Number(body.coverageAmount),
        premiumPaid: Number(body.premiumPaid),
        startDate,
        endDate,
        status: PolicyStatus.ACTIVE,
      },
      include: {
        farm: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        claims: true,
      },
    });

    return NextResponse.json({ policy }, { status: 201 });
  } catch (error) {
    console.error("POST /api/policies error:", error);
    return NextResponse.json(
      { error: "Failed to create parametric policy." },
      { status: 500 }
    );
  }
}
