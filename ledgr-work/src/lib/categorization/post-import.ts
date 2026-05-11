/**
 * Post-import auto-categorization.
 *
 * Called after a successful import to automatically assign categories
 * to newly imported transactions using the rule-based engine.
 *
 * - Only processes transactions from the given importId.
 * - Only applies when confidence >= MIN_CONFIDENCE.
 * - Never overwrites an existing categoryId.
 * - Fails silently: any error here must NOT affect the import response.
 */

import { prisma } from "@/lib/db/prisma";
import { bulkCategorize, type UserLearningRule } from "@/lib/categorization/engine";

const MIN_CONFIDENCE = 80;

export interface AutoCategorizeResult {
  categorized: number;
  skipped: number;
  total: number;
}

export async function autoCategorizePOSTImport(
  userId: string,
  importId: string
): Promise<AutoCategorizeResult> {
  // 1. Load transactions from this import that have no category yet
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      importId,
      categoryId: null,
      type: { in: ["INCOME", "EXPENSE"] }, // skip TRANSFER / REFUND
    },
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

  if (transactions.length === 0) {
    return { categorized: 0, skipped: 0, total: 0 };
  }

  // 2. Load user learning rules
  const rawRules = await prisma.userLearningRule.findMany({
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

  const userRules: UserLearningRule[] = rawRules.map((r) => ({
    userId: r.userId,
    counterpartyIban: r.counterpartyIban ?? undefined,
    merchantNameContains: r.merchantNameContains ?? undefined,
    descriptionContains: r.descriptionContains ?? undefined,
    categorySlug: r.categorySlug,
    categoryName: r.categoryName,
    createdAt: r.createdAt,
  }));

  // 3. Load user's categories indexed by name (case-insensitive)
  const categories = await prisma.category.findMany({
    where: { userId },
    select: { id: true, name: true, type: true },
  });

  const categoryByName = new Map<string, { id: string; type: string }>();
  for (const cat of categories) {
    categoryByName.set(cat.name.toLowerCase(), { id: cat.id, type: cat.type });
  }

  // 4. Run bulk categorization
  const txInputs = transactions.map((tx) => ({
    counterpartyName: tx.counterpartyName,
    counterpartyIban: tx.counterpartyIban,
    description: tx.description,
    reference: tx.reference,
    signedAmount: Number(tx.signedAmount),
    rawData: (tx.rawData as Record<string, unknown> | undefined) ?? undefined,
  }));

  const suggestions = bulkCategorize(txInputs, userRules, MIN_CONFIDENCE);

  // 5. Resolve slug → categoryId and batch-update
  const updates: Array<{ id: string; categoryId: string }> = [];

  for (const [idx, suggestion] of suggestions.entries()) {
    const tx = transactions[idx];
    const catEntry = categoryByName.get(suggestion.categoryName.toLowerCase());
    if (!catEntry) continue; // user doesn't have this category — skip

    updates.push({ id: tx.id, categoryId: catEntry.id });
  }

  if (updates.length > 0) {
    // Batch-update in groups of 50 to avoid large IN clauses
    const BATCH = 50;
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);

      // Group by categoryId to minimise DB round-trips
      const byCat = new Map<string, string[]>();
      for (const u of batch) {
        const arr = byCat.get(u.categoryId) ?? [];
        arr.push(u.id);
        byCat.set(u.categoryId, arr);
      }

      for (const [categoryId, ids] of byCat) {
        await prisma.transaction.updateMany({
          where: { id: { in: ids }, userId, categoryId: null },
          data: { categoryId },
        });
      }
    }
  }

  return {
    categorized: updates.length,
    skipped: transactions.length - updates.length,
    total: transactions.length,
  };
}
