import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";
import { dashboardQuerySchema } from "@/lib/validations/schemas";
import {
  calculateSummary,
  calculateMonthlyData,
  calculateCategoryBreakdown,
  calculateYearlyData,
} from "@/lib/accounting/engine";
import type { Prisma } from "@prisma/client";
import type { Transaction } from "@/types";

export async function GET(request: NextRequest) {
  try {
    // ── Auth diagnostics ──────────────────────────────────────────────────
    const cookieStore = cookies();
    const allCookies = cookieStore.getAll();
    console.log("[dashboard] cookies present:", allCookies.map((c) => c.name));

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() {},
        },
      }
    );
    const { data: { user: sbUser }, error: sbError } = await supabase.auth.getUser();
    console.log("[dashboard] SUPABASE_URL set:", !!process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log("[dashboard] getUser error:", sbError?.message ?? "none");
    console.log("[dashboard] getUser userId:", sbUser?.id ?? "null");
    console.log("[dashboard] getUser email:", sbUser?.email ?? "null");
    // ─────────────────────────────────────────────────────────────────────

    const user = await getCurrentUser();
    if (!user) return apiError("Unauthorized", 401);

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = dashboardQuerySchema.safeParse(searchParams);
    if (!parsed.success) return apiError("Invalid query", 400);

    const { dateFrom, dateTo, accountId } = parsed.data;

    const where: Prisma.TransactionWhereInput = {
      userId: user.id,
      ...(dateFrom && { date: { gte: new Date(dateFrom) } }),
      ...(dateTo && { date: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), lte: new Date(dateTo) } }),
      ...(accountId && { accountId }),
    };

    const rawTransactions = await prisma.transaction.findMany({
      where,
      include: { category: true },
      orderBy: { date: "asc" },
    });

    const transactions: Transaction[] = rawTransactions.map((tx) => ({
      ...tx,
      amount: Number(tx.amount),
      signedAmount: Number(tx.signedAmount),
      rawData: tx.rawData as Record<string, unknown> | null,
      category: tx.category ?? null,
      client: null,
      account: null,
    }));

    const summary = calculateSummary(transactions);
    const monthly = calculateMonthlyData(transactions);
    const yearly = calculateYearlyData(transactions);
    const expenseBreakdown = calculateCategoryBreakdown(transactions, "EXPENSE");
    const incomeBreakdown = calculateCategoryBreakdown(transactions, "INCOME");

    const recentTransactions = rawTransactions
      .filter((tx) => tx.type !== "TRANSFER")
      .slice(-10)
      .reverse()
      .map((tx) => ({
        id: tx.id,
        date: tx.date.toISOString(),
        amount: Number(tx.amount),
        signedAmount: Number(tx.signedAmount),
        type: tx.type,
        description: tx.description,
        counterpartyName: tx.counterpartyName,
        currency: tx.currency,
      }));

    return apiSuccess({
      summary,
      monthly,
      yearly,
      expenseBreakdown,
      incomeBreakdown,
      recentTransactions,
      period: {
        from: dateFrom ?? null,
        to: dateTo ?? null,
      },
    });
  } catch (err) {
    console.error("[dashboard] GET error:", err);
    return apiError("Internal server error", 500);
  }
}
