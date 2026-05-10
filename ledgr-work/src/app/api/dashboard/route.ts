import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { apiError, apiSuccess } from "@/lib/utils/auth";
import { dashboardQuerySchema } from "@/lib/validations/schemas";
import {
  calculateSummary,
  calculateMonthlyData,
  calculateCategoryBreakdown,
  calculateYearlyData,
} from "@/lib/accounting/engine";
import type { Transaction } from "@/types";

export async function GET(request: NextRequest) {
  try {
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) console.error("[dashboard] auth error:", authError.message);
    if (!user) return apiError("Unauthorized", 401);

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = dashboardQuerySchema.safeParse(searchParams);
    if (!parsed.success) return apiError("Invalid query", 400);

    const { dateFrom, dateTo, accountId } = parsed.data;

    let query = supabase
      .from("transactions")
      .select("*, category:categories(*)")
      .eq("userId", user.id)
      .order("date", { ascending: true });

    if (dateFrom) query = query.gte("date", dateFrom);
    if (dateTo) query = query.lte("date", dateTo);
    if (accountId) query = query.eq("accountId", accountId);

    const { data: rows, error: txError } = await query;
    if (txError) {
      console.error("[dashboard] query error:", txError.message);
      return apiError("Internal server error", 500);
    }

    const transactions: Transaction[] = (rows ?? []).map((tx) => ({
      ...tx,
      amount: Number(tx.amount),
      signedAmount: Number(tx.signedAmount),
      date: new Date(tx.date),
      rawData: tx.rawData ?? null,
      category: tx.category ?? null,
      client: null,
      account: null,
    }));

    const summary = calculateSummary(transactions);
    const monthly = calculateMonthlyData(transactions);
    const yearly = calculateYearlyData(transactions);
    const expenseBreakdown = calculateCategoryBreakdown(transactions, "EXPENSE");
    const incomeBreakdown = calculateCategoryBreakdown(transactions, "INCOME");

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
        counterpartyName: string | null;
        currency: string;
      }) => ({
        id: tx.id,
        date: new Date(tx.date).toISOString(),
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
    console.error("[dashboard] GET error:", err instanceof Error ? err.message : String(err));
    return apiError("Internal server error", 500);
  }
}
