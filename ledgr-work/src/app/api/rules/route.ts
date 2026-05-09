import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";
import { z } from "zod";

const createRuleSchema = z.object({
  counterpartyIban: z.string().optional(),
  merchantNameContains: z.string().min(2).max(200).optional(),
  descriptionContains: z.string().min(2).max(200).optional(),
  categoryId: z.string(),
}).refine(
  (d) => d.counterpartyIban || d.merchantNameContains || d.descriptionContains,
  { message: "At least one matching condition is required" }
);

/**
 * GET /api/rules
 * List all learning rules for the current user.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError("Unauthorized", 401);

  const rules = await prisma.userLearningRule.findMany({
    where: { userId: user.id },
    include: { category: { select: { id: true, name: true, type: true, color: true } } },
    orderBy: { createdAt: "desc" },
  });

  return apiSuccess(rules);
}

/**
 * POST /api/rules
 * Create a new learning rule.
 * These rules always override built-in AI categorization.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  if (!body) return apiError("Invalid JSON body", 400);

  const parsed = createRuleSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  // Verify the category belongs to this user
  const category = await prisma.category.findFirst({
    where: { id: parsed.data.categoryId, userId: user.id },
    select: { id: true, name: true },
  });
  if (!category) return apiError("Category not found", 404);

  // Prevent exact duplicate rules
  const existing = await prisma.userLearningRule.findFirst({
    where: {
      userId: user.id,
      counterpartyIban: parsed.data.counterpartyIban ?? null,
      merchantNameContains: parsed.data.merchantNameContains ?? null,
      descriptionContains: parsed.data.descriptionContains ?? null,
      categoryId: parsed.data.categoryId,
    },
  });
  if (existing) return apiError("An identical rule already exists", 409);

  const rule = await prisma.userLearningRule.create({
    data: {
      userId: user.id,
      counterpartyIban: parsed.data.counterpartyIban,
      merchantNameContains: parsed.data.merchantNameContains,
      descriptionContains: parsed.data.descriptionContains,
      categoryId: parsed.data.categoryId,
      categorySlug: category.name.toLowerCase().replace(/\s+/g, "_"),
      categoryName: category.name,
    },
    include: { category: { select: { id: true, name: true, type: true } } },
  });

  return apiSuccess(rule, 201);
}
