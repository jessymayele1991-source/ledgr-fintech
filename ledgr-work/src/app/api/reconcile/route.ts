import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";
import { reconcile, formatReconciliationReport } from "@/lib/reconciliation/engine";
import { z } from "zod";

const reconcileSchema = z.object({
  accountId: z.string().optional(),
  /** Opening balance from bank statement */
  openingBalance: z.number(),
  /** Closing balance from bank statement */
  closingBalance: z.number(),
  currency: z.string().default("EUR"),
  periodStart: z.string(),  // ISO date
  periodEnd: z.string(),    // ISO date
  /** Include transfers in reconciliation */
  includeTransfers: z.boolean().default(true),
});

/**
 * POST /api/reconcile
 *
 * Reconciles imported transactions against known opening/closing balances.
 * Returns BALANCED, MISMATCH, or MISSING_TRANSACTIONS with full issue list.
 *
 * The opening/closing balances come from the bank statement (MT940/CAMT.053).
 * This validates that all transactions were correctly imported.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError("Unauthorized", 401);

    const body = await request.json().catch(() => null);
    if (!body) return apiError("Invalid JSON body", 400);

    const parsed = reconcileSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.message, 400);

    const { accountId, openingBalance, closingBalance, currency, periodStart, periodEnd, includeTransfers } = parsed.data;

    // ── Load transactions for the period ──────────────────────────────────────
    const where: Record<string, unknown> = {
      userId: user.id,
      date: {
        gte: new Date(periodStart),
        lte: new Date(periodEnd + "T23:59:59.999Z"),
      },
    };

    if (accountId) where.accountId = accountId;
    if (!includeTransfers) where.NOT = { type: "TRANSFER" };

    const rawTxs = await prisma.transaction.findMany({
      where,
      select: {
        id: true,
        date: true,
        signedAmount: true,
        type: true,
        transactionHash: true,
        description: true,
        counterpartyIban: true,
      },
      orderBy: { date: "asc" },
    });

    if (rawTxs.length === 0) {
      return apiSuccess({
        status: "UNCHECKED",
        message: "No transactions found for this period and account",
        transactionCount: 0,
        openingBalance,
        closingBalance,
      });
    }

    // ── Run reconciliation ─────────────────────────────────────────────────────
    const transactions = rawTxs.map((tx) => ({
      id: tx.id,
      date: tx.date,
      signedAmount: Number(tx.signedAmount),
      type: tx.type,
      transactionHash: tx.transactionHash ?? tx.id,
      description: tx.description,
      counterpartyIban: tx.counterpartyIban,
    }));

    const result = reconcile(transactions, {
      opening: openingBalance,
      closing: closingBalance,
      currency,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
    });

    // ── Log to audit ──────────────────────────────────────────────────────────
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "RECONCILIATION_RUN",
        entityType: "Reconciliation",
        entityId: accountId ?? "all",
        summary: `Reconciliation: ${result.status} (discrepancy €${result.discrepancy.toFixed(2)}, ${result.issues.length} issues)`,
        metadata: {
          status: result.status,
          discrepancy: result.discrepancy,
          transactionCount: result.transactionCount,
          issueCount: result.issues.length,
          periodStart,
          periodEnd,
          accountId,
        },
      },
    }).catch(() => {}); // Non-fatal

    return apiSuccess({
      ...result,
      report: formatReconciliationReport(result),
    });
  } catch (err) {
    console.error("[reconcile] POST error:", err);
    return apiError("Internal server error", 500);
  }
}

/**
 * GET /api/reconcile?importId=xxx
 *
 * Auto-reconcile based on metadata stored during import (MT940/CAMT opening/closing balances).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError("Unauthorized", 401);

    const { searchParams } = request.nextUrl;
    const importId = searchParams.get("importId");

    if (!importId) return apiError("importId is required", 400);

    const importRecord = await prisma.import.findFirst({
      where: { id: importId, userId: user.id },
    });

    if (!importRecord) return apiError("Import not found", 404);

    // Check if import has balance metadata
    const meta = importRecord.errors as unknown as Record<string, unknown> | null;
    if (!meta?.openingBalance || !meta?.closingBalance) {
      return apiSuccess({
        status: "UNCHECKED",
        message: "This import has no opening/closing balance metadata (CSV files don't include balances; use MT940 or CAMT.053 for reconciliation)",
        importId,
      });
    }

    // Load transactions from this import
    const rawTxs = await prisma.transaction.findMany({
      where: { importId, userId: user.id },
      select: {
        id: true, date: true, signedAmount: true, type: true,
        transactionHash: true, description: true, counterpartyIban: true,
      },
      orderBy: { date: "asc" },
    });

    const transactions = rawTxs.map((tx) => ({
      id: tx.id,
      date: tx.date,
      signedAmount: Number(tx.signedAmount),
      type: tx.type,
      transactionHash: tx.transactionHash ?? tx.id,
      description: tx.description,
      counterpartyIban: tx.counterpartyIban,
    }));

    const result = reconcile(transactions, {
      opening: Number(meta.openingBalance),
      closing: Number(meta.closingBalance),
      currency: (meta.currency as string) ?? "EUR",
      periodStart: new Date((meta.periodStart as string) ?? importRecord.createdAt),
      periodEnd: new Date((meta.periodEnd as string) ?? importRecord.createdAt),
    });

    return apiSuccess({
      ...result,
      importId,
      report: formatReconciliationReport(result),
    });
  } catch (err) {
    console.error("[reconcile] GET error:", err);
    return apiError("Internal server error", 500);
  }
}
