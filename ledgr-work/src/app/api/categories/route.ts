import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";
import { createCategorySchema } from "@/lib/validations/schemas";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return apiError("Unauthorized", 401);

    const type = request.nextUrl.searchParams.get("type");

    const categories = await prisma.category.findMany({
      where: {
        userId: user.id,
        ...(type && { type: type as "INCOME" | "EXPENSE" | "TRANSFER" }),
        parentId: null, // top-level only
      },
      include: {
        children: true,
        _count: { select: { transactions: true } },
      },
      orderBy: { name: "asc" },
    });

    return apiSuccess(categories);
  } catch (err) {
    console.error("[categories] GET error:", err);
    return apiError("Internal server error", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return apiError("Unauthorized", 401);

    const body = await request.json();
    const parsed = createCategorySchema.safeParse(body);
    if (!parsed.success) return apiError("Validation error: " + parsed.error.message, 400);

    // Check for duplicate name+type
    const existing = await prisma.category.findUnique({
      where: {
        userId_name_type: {
          userId: user.id,
          name: parsed.data.name,
          type: parsed.data.type,
        },
      },
    });
    if (existing) return apiError("A category with this name and type already exists", 409);

    const category = await prisma.category.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        type: parsed.data.type,
        color: parsed.data.color || null,
        icon: parsed.data.icon || null,
        parentId: parsed.data.parentId ?? null,
      },
    });

    return apiSuccess(category, 201);
  } catch (err) {
    console.error("[categories] POST error:", err);
    return apiError("Internal server error", 500);
  }
}
