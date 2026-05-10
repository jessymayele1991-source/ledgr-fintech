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

    let txQuery = supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: true });

    if (dateFrom) txQuery = txQuery.gte("date", dateFrom);
    if (dateTo) txQuery = txQuery.lte("date", dateTo);
    if (accountId) txQuery = txQuery.eq("account_id", accountId);

    const { data: rows, error: txError } = await txQuery;
    if (txError) {
      console.error("[dashboard] query error:", txError.message);
      return apiError("Internal server error", 500);
    }

    const { data: catRows } = await supabase
      .from("categories")
      .select("id, name, color")
      .eq("user_id", user.id);

    const categoryMap = new Map((catRows ?? []).map((c) => [c.id, c]));

    const transactions = (rows ?? []).map((tx) => ({
      id: tx.id,
      userId: tx.user_id ?? tx.userId ?? "",
      date: new Date(tx.date),
      amount: Number(tx.amount),
      signedAmount: Number(tx.signed_amount ?? tx.signedAmount ?? 0),
      type: tx.type,
      description: tx.description ?? null,
      reference: tx.reference ?? null,
      counterpartyName: tx.counterparty_name ?? tx.counterpartyName ?? null,
      counterpartyIban: tx.counterparty_iban ?? tx.counterpartyIban ?? null,
      currency: tx.currency,
      categoryId: tx.category_id ?? tx.categoryId ?? null,
      clientId: tx.client_id ?? tx.clientId ?? null,
      accountId: tx.account_id ?? tx.accountId ?? null,
      transferPairId: tx.transfer_pair_id ?? tx.transferPairId ?? null,
      importId: tx.import_id ?? tx.importId ?? null,
      transactionHash: tx.transaction_hash ?? tx.transactionHash ?? "",
      rawData: tx.raw_data ?? tx.rawData ?? null,
      isManual: tx.is_manual ?? tx.isManual ?? false,
      isReconciled: tx.is_reconciled ?? tx.isReconciled ?? false,
      notes: tx.notes ?? null,
      createdAt: new Date(tx.created_at ?? tx.createdAt),
      updatedAt: new Date(tx.updated_at ?? tx.updatedAt),
      category: tx.category_id ? (categoryMap.get(tx.category_id) ?? null) : null,
      client: null,
      account: null,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = transactions as any[];
    const summary = calculateSummary(tx);
    const monthly = calculateMonthlyData(tx);
    const yearly = calculateYearlyData(tx);
    const expenseBreakdown = calculateCategoryBreakdown(tx, "EXPENSE");
    const incomeBreakdown = calculateCategoryBreakdown(tx, "INCOME");

    const recentTransactions = (rows ?? [])
      .filter((tx: { type: string }) => tx.type !== "TRANSFER")
      .slice(-10)
      .reverse()
      .map((tx: {
        id: string;
        date: string;
        amount: number | string;
        signed_amount?: number | string;
        signedAmount?: number | string;
        type: string;
        description: string | null;
        counterparty_name?: string | null;
        counterpartyName?: string | null;
        currency: string;
      }) => ({
        id: tx.id,
        date: new Date(tx.date).toISOString(),
        amount: Number(tx.amount),
        signedAmount: Number(tx.signed_amount ?? tx.signedAmount ?? 0),
        type: tx.type,
        description: tx.description,
        counterpartyName: tx.counterparty_name ?? tx.counterpartyName ?? null,
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
