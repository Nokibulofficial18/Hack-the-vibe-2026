import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSessionUser } from "@/lib/auth-server";
import { validateFarmPayload } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const currentUser = await getServerSessionUser(request);
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get("userId");

    // Enforce M03 resource isolation: Farmers cannot query another farmer's plots
    if (
      currentUser.role !== "ADMIN" &&
      requestedUserId &&
      requestedUserId !== currentUser.id
    ) {
      return NextResponse.json(
        { error: "Forbidden: Farmers can only access their own farm plots." },
        { status: 403 }
      );
    }

    const whereClause =
      currentUser.role === "ADMIN"
        ? requestedUserId
          ? { userId: requestedUserId }
          : undefined
        : { userId: currentUser.id };

    const farms = await prisma.farm.findMany({
      where: whereClause,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        policies: {
          select: {
            id: true,
            metricType: true,
            thresholdValue: true,
            coverageAmount: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      farms,
      currentUser,
      scope: currentUser.role === "ADMIN" ? "GLOBAL" : "USER_ISOLATED",
    });
  } catch (error) {
    console.error("GET /api/farms error:", error);
    return NextResponse.json(
      { error: "Failed to fetch farm plots." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await getServerSessionUser(request);
    const body = (await request.json()) as {
      name?: string;
      cropType?: string;
      latitude?: number | string;
      longitude?: number | string;
      sizeHectares?: number | string;
      ownerUserId?: string;
    };

    const validation = validateFarmPayload(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", fieldErrors: validation.errors },
        { status: 400 }
      );
    }

    // Farmers always create farms for themselves; Admins may assign a farm to a specific farmer
    let targetUserId = currentUser.id;
    if (currentUser.role === "ADMIN" && body.ownerUserId) {
      const targetUser = await prisma.user.findUnique({
        where: { id: body.ownerUserId },
      });
      if (!targetUser) {
        return NextResponse.json(
          { error: "Selected farmer account does not exist." },
          { status: 404 }
        );
      }
      targetUserId = targetUser.id;
    } else if (
      currentUser.role !== "ADMIN" &&
      body.ownerUserId &&
      body.ownerUserId !== currentUser.id
    ) {
      return NextResponse.json(
        { error: "Forbidden: Cannot register farm plots for another user." },
        { status: 403 }
      );
    }

    const farm = await prisma.farm.create({
      data: {
        name: body.name!.trim(),
        cropType: body.cropType!.trim(),
        latitude: Number(body.latitude),
        longitude: Number(body.longitude),
        sizeHectares: Number(body.sizeHectares),
        userId: targetUserId,
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        policies: true,
      },
    });

    return NextResponse.json({ farm }, { status: 201 });
  } catch (error) {
    console.error("POST /api/farms error:", error);
    return NextResponse.json(
      { error: "Failed to register farm plot." },
      { status: 500 }
    );
  }
}
