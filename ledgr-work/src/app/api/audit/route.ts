import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit
 *
 * Query params:
 *  entityType  — filter by entity (Transaction, Import, Category, etc.)
 *  entityId    — filter by specific entity ID
 *  action      — filter by action type
 *  page        — page number (default 1)
 *  pageSize    — items per page (default 50, max 200)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return apiError("Unauthorized", 401);

    const { searchParams } = request.nextUrl;
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");
    const action = searchParams.get("action");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10)));

    const where: Record<string, unknown> = { userId: user.id };
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (action) where.action = action;

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          summary: true,
          metadata: true,
          createdAt: true,
          // Omit before/after for list view (too large)
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return apiSuccess({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    console.error("[audit] GET error:", err);
    return apiError("Internal server error", 500);
  }
}
