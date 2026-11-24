import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSessionUser } from "@/lib/auth-server";

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
