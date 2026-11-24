import { NextResponse } from "next/server";
import { PayoutMethod } from "@prisma/client";
import prisma from "@/lib/prisma";
import { canAccessResource, getServerSessionUser } from "@/lib/auth-server";
import { isValidPayoutMethod, validateBdMobileNumber } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const currentUser = await getServerSessionUser(request);

    if (currentUser.role === "ADMIN") {
      const farmers = await prisma.user.findMany({
        where: { role: "FARMER" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          balance: true,
          payoutMethod: true,
          mobileNumber: true,
          _count: { select: { farms: true } },
        },
        orderBy: { name: "asc" },
      });

      return NextResponse.json({ currentUser, farmers });
    }

    return NextResponse.json({ currentUser, farmers: [] });
  } catch (error) {
    console.error("GET /api/users error:", error);
    return NextResponse.json(
      { error: "Failed to load user session." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const currentUser = await getServerSessionUser(request);
    const body = (await request.json()) as {
      userId?: string;
      payoutMethod?: string;
      mobileNumber?: string;
    };

    const targetUserId = body.userId ?? currentUser.id;
    if (!canAccessResource(currentUser, targetUserId)) {
      return NextResponse.json(
        { error: "Forbidden: You can only update your own mobile payout wallet." },
        { status: 403 }
      );
    }

    if (!isValidPayoutMethod(body.payoutMethod)) {
      return NextResponse.json(
        {
          error: "Invalid payout method. Choose BKASH, NAGAD, or ROCKET.",
          fieldErrors: { payoutMethod: "Select bKash, Nagad, or Rocket." },
        },
        { status: 400 }
      );
    }

    const phoneValidation = validateBdMobileNumber(body.mobileNumber);
    if (!phoneValidation.valid) {
      return NextResponse.json(
        {
          error: phoneValidation.error,
          fieldErrors: { mobileNumber: phoneValidation.error ?? "Invalid BD mobile number." },
        },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        payoutMethod: body.payoutMethod as PayoutMethod,
        mobileNumber: phoneValidation.normalized,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        balance: true,
        payoutMethod: true,
        mobileNumber: true,
      },
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error("PATCH /api/users error:", error);
    return NextResponse.json(
      { error: "Failed to update mobile wallet settings." },
      { status: 500 }
    );
  }
}
