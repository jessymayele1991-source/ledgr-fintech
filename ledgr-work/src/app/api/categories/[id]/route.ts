import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";
import { updateCategorySchema } from "@/lib/validations/schemas";

interface Params { params: { id: string } }

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return apiError("Unauthorized", 401);

    const existing = await prisma.category.findFirst({
      where: { id: params.id, userId: user.id },
    });
    if (!existing) return apiError("Category not found", 404);

    const body = await request.json();
    const parsed = updateCategorySchema.safeParse(body);
    if (!parsed.success) return apiError("Validation error: " + parsed.error.message, 400);

    const updated = await prisma.category.update({
      where: { id: params.id },
      data: {
        ...parsed.data,
        color: parsed.data.color || null,
        icon: parsed.data.icon || null,
        parentId: parsed.data.parentId ?? null,
      },
    });

    return apiSuccess(updated);
  } catch (err) {
    console.error("[categories/[id]] PATCH error:", err);
    return apiError("Internal server error", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return apiError("Unauthorized", 401);

    const existing = await prisma.category.findFirst({
      where: { id: params.id, userId: user.id },
    });
    if (!existing) return apiError("Category not found", 404);
    if (existing.isSystem) return apiError("Cannot delete system categories", 403);

    // Detach transactions before deleting
    await prisma.transaction.updateMany({
      where: { categoryId: params.id, userId: user.id },
      data: { categoryId: null },
    });

    await prisma.category.delete({ where: { id: params.id } });

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error("[categories/[id]] DELETE error:", err);
    return apiError("Internal server error", 500);
  }
}
