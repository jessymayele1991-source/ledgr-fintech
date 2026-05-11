import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";
import { dashboardQuerySchema } from "@/lib/validations/schemas";
import {
  calculateSummary,
  calculateMonthlyData,
  calculateCategoryBreakdown,
  calculateYearlyData,
} from "@/lib/accounting/engine";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // Use getCurrentUser() so user.id is the Prisma CUID that matches
    // transactions.userId and categories.userId in the database.
    const out: { reason?: string } = {};
    const user = await getCurrentUser(out);
    if (!user) return apiError(out.reason ?? "Unauthorized", 401);

    const cookieStore = cookies();
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

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = dashboardQuerySchema.safeParse(searchParams);
    if (!parsed.success) return apiError("Invalid query", 400);

    const { dateFrom, dateTo, accountId } = parsed.data;

    // Column names match the Prisma-generated schema (camelCase).
    let txQuery = supabase
      .from("transactions")
      .select("*")
      .eq("userId", user.id)
      .order("date", { ascending: true });

    if (dateFrom) txQuery = txQuery.gte("date", dateFrom);
    if (dateTo)   txQuery = txQuery.lte("date", dateTo);
    if (accountId) txQuery = txQuery.eq("accountId", accountId);

    const { data: rows, error: txError } = await txQuery;
    if (txError) {
      console.error("[dashboard] query error:", txError.message);
      return apiError("Internal server error", 500);
    }

    const { data: catRows } = await supabase
      .from("categories")
      .select("id, name, color")
      .eq("userId", user.id);

    const categoryMap = new Map((catRows ?? []).map((c) => [c.id, c]));

    // All columns are camelCase (Prisma-generated) — no snake_case fallbacks needed.
    const transactions = (rows ?? []).map((tx) => ({
      id: tx.id,
      userId: tx.userId,
      date: new Date(tx.date),
      amount: Number(tx.amount),
      signedAmount: Number(tx.signedAmount),
      type: tx.type,
      description: tx.description ?? null,
      reference: tx.reference ?? null,
      counterpartyName: tx.counterpartyName ?? null,
      counterpartyIban: tx.counterpartyIban ?? null,
      currency: tx.currency,
      categoryId: tx.categoryId ?? null,
      clientId: tx.clientId ?? null,
      accountId: tx.accountId ?? null,
      transferPairId: tx.transferPairId ?? null,
      importId: tx.importId ?? null,
      transactionHash: tx.transactionHash ?? "",
      rawData: tx.rawData ?? null,
      isManual: tx.isManual ?? false,
      isReconciled: tx.isReconciled ?? false,
      notes: tx.notes ?? null,
      createdAt: new Date(tx.createdAt),
      updatedAt: new Date(tx.updatedAt),
      category: tx.categoryId ? (categoryMap.get(tx.categoryId) ?? null) : null,
      client: null,
      account: null,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txList = transactions as any[];
    const summary = calculateSummary(txList);
    const monthly = calculateMonthlyData(txList);
    const yearly = calculateYearlyData(txList);
    const expenseBreakdown = calculateCategoryBreakdown(txList, "EXPENSE");
    const incomeBreakdown = calculateCategoryBreakdown(txList, "INCOME");

    const recentTransactions = (rows ?? [])
      .filter((tx: { type: string }) => tx.type !== "TRANSFER")
      .slice(-10)
      .reverse()
      .map((tx: {
        id: string;
        date: string;
        amount: number | string;
        signedAmount: number | string;
        type: string;
        description: string | null;
        counterpartyName?: string | null;
        currency: string;
      }) => ({
        id: tx.id,
        date: new Date(tx.date).toISOString(),
        amount: Number(tx.amount),
        signedAmount: Number(tx.signedAmount),
        type: tx.type,
        description: tx.description,
        counterpartyName: tx.counterpartyName ?? null,
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
    console.error("[dashboard] GET error:", err instanceof Error ? err.message : String(err));
    return apiError("Internal server error", 500);
  }
}
