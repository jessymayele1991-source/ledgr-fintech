"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, DollarSign, Activity } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { formatCurrency, formatDate, getTransactionTypeBg, cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";

async function fetchDashboard(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/dashboard${qs ? `?${qs}` : ""}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Failed to load dashboard");
  return json.data;
}

const CHART_COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#84cc16","#f97316","#ec4899","#14b8a6"];

export default function DashboardPage() {
  const { t } = useI18n();
  const { data, isLoading, error } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard() });

  if (isLoading) return <DashboardSkeleton />;
  if (error) return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
        {t("dashboard.loadError")}: {(error as Error).message}
      </div>
    </div>
  );

  const { summary, monthly, expenseBreakdown, recentTransactions } = data;

  const statsCards = [
    { label: t("dashboard.totalRevenue"),  value: formatCurrency(summary.totalRevenue),  icon: TrendingUp,  color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: t("dashboard.totalExpenses"), value: formatCurrency(summary.netExpenses),   icon: TrendingDown, color: "text-red-500",     bg: "bg-red-50" },
    { label: t("dashboard.netProfit"),     value: formatCurrency(summary.netProfit),     icon: DollarSign,  color: summary.netProfit >= 0 ? "text-emerald-600" : "text-red-500", bg: summary.netProfit >= 0 ? "bg-emerald-50" : "bg-red-50" },
    { label: t("dashboard.cashflow"),      value: formatCurrency(summary.cashflow),      icon: Activity,    color: summary.cashflow >= 0 ? "text-indigo-600" : "text-red-500",   bg: "bg-indigo-50" },
  ];

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("dashboard.title")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("dashboard.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statsCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="card p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{card.label}</p>
                  <p className={cn("text-2xl font-bold mt-2 tabular-nums", card.color)}>{card.value}</p>
                </div>
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", card.bg)}>
                  <Icon className={cn("w-5 h-5", card.color)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 card p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-6">{t("dashboard.revenueAndExpenses")}</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthly} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickFormatter={(v: string) => { const [y, m] = v.split("-"); return new Date(Number(y), Number(m)-1).toLocaleDateString("en", { month: "short" }); }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={(v: number) => `€${(v/1000).toFixed(0)}k`} width={50} />
              <Tooltip contentStyle={{ border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "12px" }} formatter={(value: number) => formatCurrency(value)} />
              <Area type="monotone" dataKey="revenue" name={t("dashboard.revenue")} stroke="#10b981" strokeWidth={2} fill="url(#colorRevenue)" />
              <Area type="monotone" dataKey="expenses" name={t("dashboard.expenses")} stroke="#ef4444" strokeWidth={2} fill="url(#colorExpenses)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-6">{t("dashboard.expensesByCategory")}</h2>
          {expenseBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={expenseBreakdown} cx="50%" cy="45%" innerRadius={60} outerRadius={90} dataKey="total" nameKey="categoryName">
                  {expenseBreakdown.map((entry: { categoryId: string; color: string | null }, i: number) => (
                    <Cell key={entry.categoryId} fill={entry.color ?? CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ fontSize: "12px", borderRadius: "8px" }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-gray-400 text-sm">{t("dashboard.noCategorizedExpenses")}</div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">{t("dashboard.recentTransactions")}</h2>
          <a href="/transactions" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">{t("dashboard.viewAll")}</a>
        </div>
        <div>
          {recentTransactions.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">{t("dashboard.noTransactions")}</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("dashboard.dateHeader")}</th>
                  <th>{t("dashboard.descriptionHeader")}</th>
                  <th>{t("dashboard.typeHeader")}</th>
                  <th className="text-right">{t("dashboard.amountHeader")}</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((tx: { id: string; date: string; description: string | null; counterpartyName: string | null; type: string; signedAmount: number; currency: string }) => (
                  <tr key={tx.id}>
                    <td className="text-gray-500 text-xs whitespace-nowrap">{formatDate(tx.date, "dd MMM")}</td>
                    <td className="text-gray-900 max-w-xs"><span className="truncate block">{tx.description || tx.counterpartyName || "—"}</span></td>
                    <td><span className={cn("badge", getTransactionTypeBg(tx.type))}>{tx.type.toLowerCase()}</span></td>
                    <td className="text-right">
                      <span className={cn("tabular-nums font-medium text-sm", tx.signedAmount >= 0 ? "text-emerald-600" : "text-red-500")}>
                        {tx.signedAmount >= 0 ? "+" : ""}{formatCurrency(tx.signedAmount, tx.currency)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-8 space-y-8 animate-pulse">
      <div className="h-8 w-48 bg-gray-200 rounded-lg" />
      <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_,i) => <div key={i} className="card p-6 h-32 bg-gray-100" />)}</div>
      <div className="grid grid-cols-3 gap-6"><div className="col-span-2 card h-80 bg-gray-100" /><div className="card h-80 bg-gray-100" /></div>
    </div>
  );
}
