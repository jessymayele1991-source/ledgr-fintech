import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";

interface Params { params: { id: string } }

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError("Unauthorized", 401);

    const rule = await prisma.userLearningRule.findFirst({
      where: { id: params.id, userId: user.id },
    });
    if (!rule) return apiError("Rule not found", 404);

    await prisma.userLearningRule.delete({ where: { id: params.id } });
    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error("[rules/[id]] DELETE error:", err);
    return apiError("Internal server error", 500);
  }
}
