import { NextResponse } from "next/server";
import { PolicyStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { canAccessResource, getServerSessionUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const currentUser = await getServerSessionUser(request);
    const existing = await prisma.policy.findUnique({
      where: { id: params.id },
      include: { farm: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Policy not found." }, { status: 404 });
    }

    if (!canAccessResource(currentUser, existing.farm.userId)) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to modify this policy." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as { status?: PolicyStatus };
    const allowedStatuses: PolicyStatus[] = [
      PolicyStatus.ACTIVE,
      PolicyStatus.CANCELLED,
      PolicyStatus.EXPIRED,
    ];

    if (!body.status || !allowedStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: "Invalid status transition requested." },
        { status: 400 }
      );
    }

    if (existing.status === PolicyStatus.CLAIMED) {
      return NextResponse.json(
        { error: "Claimed policies cannot be modified." },
        { status: 400 }
      );
    }

    const updated = await prisma.policy.update({
      where: { id: existing.id },
      data: { status: body.status },
    });

    return NextResponse.json({ policy: updated });
  } catch (error) {
    console.error("PATCH /api/policies/[id] error:", error);
    return NextResponse.json({ error: "Failed to update policy." }, { status: 500 });
  }
}
