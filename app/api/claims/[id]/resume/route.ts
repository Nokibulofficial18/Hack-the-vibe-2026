import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { canAccessResource, getServerSessionUser } from "@/lib/auth-server";
import { resumeParametricClaimWorkflow } from "@/lib/workflowEngine";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const currentUser = await getServerSessionUser(request);
    const body = (await request.json().catch(() => ({}))) as {
      simulateStep4Failure?: boolean;
    };

    const existing = await prisma.claim.findUnique({
      where: { id: params.id },
      include: { policy: { include: { farm: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Claim not found." }, { status: 404 });
    }

    if (!canAccessResource(currentUser, existing.policy.farm.userId)) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to resume this claim workflow." },
        { status: 403 }
      );
    }

    if (body.simulateStep4Failure && currentUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Only Risk Admins can simulate Step 4 failures." },
        { status: 403 }
      );
    }

    const result = await resumeParametricClaimWorkflow(existing.id, {
      simulateStep4Failure:
        currentUser.role === "ADMIN" && Boolean(body.simulateStep4Failure),
    });

    const statusCode =
      result.outcome === "DISBURSED"
        ? 200
        : result.outcome === "PAUSED_AT_STEP_4"
          ? 202
          : result.outcome === "DUPLICATE_BLOCKED"
            ? 409
            : 400;

    return NextResponse.json(result, { status: statusCode });
  } catch (error) {
    console.error("POST /api/claims/[id]/resume error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to resume parametric claim workflow.",
      },
      { status: 500 }
    );
  }
}
