import { NextRequest } from "next/server";
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

  // Serialize decimals
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

  // Recent transactions (last 10, no transfers)
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
}
