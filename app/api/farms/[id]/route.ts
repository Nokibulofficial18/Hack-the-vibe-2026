import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { canAccessResource, getServerSessionUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const currentUser = await getServerSessionUser(request);
    const farm = await prisma.farm.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        policies: { include: { claims: true } },
      },
    });

    if (!farm) {
      return NextResponse.json({ error: "Farm plot not found." }, { status: 404 });
    }

    if (!canAccessResource(currentUser, farm.userId)) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to view this farm plot." },
        { status: 403 }
      );
    }

    return NextResponse.json({ farm });
  } catch (error) {
    console.error("GET /api/farms/[id] error:", error);
    return NextResponse.json({ error: "Failed to load farm plot." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const currentUser = await getServerSessionUser(request);
    const farm = await prisma.farm.findUnique({
      where: { id: params.id },
      include: { policies: { include: { claims: true } } },
    });

    if (!farm) {
      return NextResponse.json({ error: "Farm plot not found." }, { status: 404 });
    }

    if (!canAccessResource(currentUser, farm.userId)) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to delete this farm plot." },
        { status: 403 }
      );
    }

    // Safely clean up any claims linked to this farm's policies before cascading farm -> policies
    const policyIds = farm.policies.map((p) => p.id);
    await prisma.$transaction(async (tx) => {
      if (policyIds.length > 0) {
        await tx.claim.deleteMany({
          where: { policyId: { in: policyIds } },
        });
      }
      await tx.farm.delete({ where: { id: farm.id } });
    });

    return NextResponse.json({
      deleted: true,
      farmId: farm.id,
      cascadedPolicies: policyIds.length,
    });
  } catch (error) {
    console.error("DELETE /api/farms/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete farm plot." }, { status: 500 });
  }
}
