import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";
import { suggestCategories, getBestCategory, bulkCategorize } from "@/lib/categorization/engine";
import { auditTransactionCategorized, auditBulkCategorized, persistAuditLog } from "@/lib/audit/logger";
import { z } from "zod";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

const suggestSchema = z.object({
  counterpartyName: z.string().nullable().optional(),
  counterpartyIban: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  signedAmount: z.number(),
});

const applySchema = z.object({
  transactionId: z.string(),
  categoryId: z.string().nullable(),
  source: z.enum(["manual", "ai", "rule"]).default("manual"),
  confidence: z.number().min(0).max(100).optional(),
});

const bulkApplySchema = z.object({
  transactionIds: z.array(z.string()).min(1).max(500),
  categoryId: z.string().nullable(),
});

const autoApplySchema = z.object({
  /** Apply AI suggestions to all uncategorized transactions for this user */
  minConfidence: z.number().min(0).max(100).default(75),
  dryRun: z.boolean().default(false),
  limit: z.number().min(1).max(1000).default(200),
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/categorize?transactionId=xxx
// Returns top-3 category suggestions for a single transaction
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return apiError("Unauthorized", 401);

    const { searchParams } = request.nextUrl;
    const transactionId = searchParams.get("transactionId");

    if (!transactionId) return apiError("transactionId is required", 400);

    const tx = await prisma.transaction.findFirst({
      where: { id: transactionId, userId: user.id },
      select: {
        id: true,
        counterpartyName: true,
        counterpartyIban: true,
        description: true,
        reference: true,
        signedAmount: true,
        rawData: true,
      },
    });

    if (!tx) return apiError("Transaction not found", 404);

    // Load user learning rules
    const userRules = await loadUserRules(user.id);

    const suggestions = suggestCategories(
      {
        counterpartyName: tx.counterpartyName,
        counterpartyIban: tx.counterpartyIban,
        description: tx.description,
        reference: tx.reference,
        signedAmount: Number(tx.signedAmount),
        rawData: tx.rawData as Record<string, unknown> | undefined,
      },
      userRules
    );

    return apiSuccess({ transactionId, suggestions });
  } catch (err) {
    console.error("[categorize] GET error:", err);
    return apiError("Internal server error", 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/categorize
// Apply a category to one or many transactions
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return apiError("Unauthorized", 401);

    const body = await request.json().catch(() => null);
    if (!body) return apiError("Invalid JSON body", 400);

    const action = body.action as string | undefined;

    // ── Action: suggest (body with transaction fields, no ID) ───────────────────
    if (action === "suggest" || (!body.transactionId && !body.transactionIds)) {
      const parsed = suggestSchema.safeParse(body);
      if (!parsed.success) return apiError(parsed.error.message, 400);
      const userRules = await loadUserRules(user.id);
      const suggestions = suggestCategories({
        counterpartyName: parsed.data.counterpartyName ?? null,
        counterpartyIban: parsed.data.counterpartyIban ?? null,
        description: parsed.data.description ?? null,
        reference: parsed.data.reference ?? null,
        signedAmount: parsed.data.signedAmount,
      }, userRules);
      return apiSuccess({ suggestions });
    }

    // ── Action: bulk-apply ──────────────────────────────────────────────────────
    if (body.transactionIds) {
      const parsed = bulkApplySchema.safeParse(body);
      if (!parsed.success) return apiError(parsed.error.message, 400);

      const { transactionIds, categoryId } = parsed.data;

      // Verify all transactions belong to user
      const count = await prisma.transaction.count({
        where: { id: { in: transactionIds }, userId: user.id },
      });
      if (count !== transactionIds.length) {
        return apiError("One or more transactions not found", 404);
      }

      // Get category name for audit
      let categoryName: string | null = null;
      if (categoryId) {
        const cat = await prisma.category.findFirst({
          where: { id: categoryId },
          select: { name: true },
        });
        categoryName = cat?.name ?? null;
      }

      await prisma.transaction.updateMany({
        where: { id: { in: transactionIds }, userId: user.id },
        data: { categoryId },
      });

      const auditEntry = auditBulkCategorized(user.id, transactionIds, categoryId, categoryName);
      await persistAuditLog(prisma, [auditEntry]).catch(() => {});

      return apiSuccess({ updated: transactionIds.length, categoryId, categoryName });
    }

    // ── Action: apply single ────────────────────────────────────────────────────
    const parsed = applySchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.message, 400);

    const { transactionId, categoryId, source, confidence } = parsed.data;

    const existing = await prisma.transaction.findFirst({
      where: { id: transactionId, userId: user.id },
      include: { category: { select: { id: true, name: true } } },
    });
    if (!existing) return apiError("Transaction not found", 404);

    let newCategoryName: string | null = null;
    if (categoryId) {
      const cat = await prisma.category.findFirst({
        where: { id: categoryId },
        select: { name: true },
      });
      newCategoryName = cat?.name ?? null;
    }

    await prisma.transaction.update({
      where: { id: transactionId },
      data: { categoryId },
    });

    const auditEntry = auditTransactionCategorized(
      user.id,
      transactionId,
      existing.categoryId,
      existing.category?.name ?? null,
      categoryId,
      newCategoryName,
      source,
      confidence
    );
    await persistAuditLog(prisma, [auditEntry]).catch(() => {});

    return apiSuccess({ transactionId, categoryId, categoryName: newCategoryName });
  } catch (err) {
    console.error("[categorize] POST error:", err);
    return apiError("Internal server error", 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/categorize — auto-apply AI to all uncategorized transactions
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return apiError("Unauthorized", 401);

    const body = await request.json().catch(() => ({}));
    const parsed = autoApplySchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.message, 400);

    const { minConfidence, dryRun, limit } = parsed.data;

    // Load uncategorized transactions
    const uncategorized = await prisma.transaction.findMany({
      where: { userId: user.id, categoryId: null },
      select: {
        id: true,
        counterpartyName: true,
        counterpartyIban: true,
        description: true,
        reference: true,
        signedAmount: true,
        rawData: true,
      },
      take: limit,
      orderBy: { date: "desc" },
    });

    if (uncategorized.length === 0) {
      return apiSuccess({ message: "No uncategorized transactions", applied: 0, skipped: 0 });
    }

    const userRules = await loadUserRules(user.id);

    // Get categorization suggestions
    const txInputs = uncategorized.map((tx) => ({
      counterpartyName: tx.counterpartyName,
      counterpartyIban: tx.counterpartyIban,
      description: tx.description,
      reference: tx.reference,
      signedAmount: Number(tx.signedAmount),
      rawData: tx.rawData as Record<string, unknown> | undefined,
    }));

    const suggestions = bulkCategorize(txInputs, userRules, minConfidence);

    // Resolve category slugs to IDs
    const categoryRows = await prisma.category.findMany({
      where: { userId: user.id },
      select: { id: true, name: true },
    });

    // Try to match by name
    const nameToId = new Map(categoryRows.map((c) => [c.name.toLowerCase(), c.id]));

    let applied = 0;
    let skipped = 0;
    const preview: Array<{ transactionId: string; categorySlug: string; confidence: number }> = [];

    for (const [idx, suggestion] of suggestions.entries()) {
      const tx = uncategorized[idx];
      // Match category by slug or approximate name
      const categoryId =
        nameToId.get(suggestion.categorySlug) ??
        nameToId.get(suggestion.categoryName.toLowerCase()) ??
        null;

      if (!categoryId) { skipped++; continue; }

      preview.push({ transactionId: tx.id, categorySlug: suggestion.categorySlug, confidence: suggestion.confidence });

      if (!dryRun) {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: { categoryId },
        }).catch(() => { skipped++; applied--; });
        applied++;
      } else {
        applied++;
      }
    }

    return apiSuccess({
      dryRun,
      applied,
      skipped,
      total: uncategorized.length,
      minConfidence,
      preview: dryRun ? preview.slice(0, 50) : undefined,
    });
  } catch (err) {
    console.error("[categorize] PATCH error:", err);
    return apiError("Internal server error", 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function loadUserRules(userId: string) {
  const rules = await prisma.userLearningRule.findMany({
    where: { userId },
    select: {
      userId: true,
      counterpartyIban: true,
      merchantNameContains: true,
      descriptionContains: true,
      categorySlug: true,
      categoryName: true,
      createdAt: true,
    },
  });
  return rules.map((r) => ({
    ...r,
    counterpartyIban: r.counterpartyIban ?? undefined,
    merchantNameContains: r.merchantNameContains ?? undefined,
    descriptionContains: r.descriptionContains ?? undefined,
  }));
}
