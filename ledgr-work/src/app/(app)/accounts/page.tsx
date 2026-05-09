"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, CreditCard, Pencil, Trash2, X, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { createAccountSchema } from "@/lib/validations/schemas";
import type { Account } from "@/types";
import type { z } from "zod";

type AccountForm = z.infer<typeof createAccountSchema>;

// Account type labels are now handled via t("accounts.type*") in render

const ACCOUNT_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#84cc16", "#f97316", "#ec4899", "#14b8a6",
];

async function fetchAccounts() {
  const res = await fetch("/api/accounts");
  const json = await res.json();
  return json.data as Account[];
}

async function saveAccount(data: AccountForm, id?: string) {
  const res = await fetch(id ? `/api/accounts/${id}` : "/api/accounts", {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message);
  return json.data;
}

async function deleteAccount(id: string) {
  const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete");
}

function AccountModal({
  open,
  account,
  onClose,
  onSuccess,
}: {
  open: boolean;
  account: Account | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useI18n();
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<AccountForm>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: {
      currency: "EUR",
      type: "CHECKING",
      color: ACCOUNT_COLORS[0],
    },
  });

  const selectedColor = watch("color");
  const mutation = useMutation({ mutationFn: (data: AccountForm) => saveAccount(data, account?.id), onSuccess });
  const onSubmit = handleSubmit((data) => mutation.mutate(data));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{account ? {t("accounts.editAccount")} : "New Account"}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          {mutation.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              {(mutation.error as Error).message}
            </div>
          )}
          <div>
            <label className="label">Account Name *</label>
            <input {...register("name")} defaultValue={account?.name} className={cn("input", errors.name && "border-red-300")} placeholder="e.g. ING Business Account" />
          </div>
          <div>
            <label className="label">IBAN</label>
            <input {...register("iban")} defaultValue={account?.iban ?? ""} className="input font-mono text-sm uppercase" placeholder="NL00 INGB 0000 0000 00" />
            {errors.iban && <p className="text-red-500 text-xs mt-1">{errors.iban.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Type</label>
              <select {...register("type")} defaultValue={account?.type ?? "CHECKING"} className="input">
                {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Currency</label>
              <input {...register("currency")} defaultValue={account?.currency ?? "EUR"} className="input uppercase" maxLength={3} />
            </div>
          </div>
          <div>
            <label className="label">Color</label>
            <div className="flex gap-2 flex-wrap">
              {ACCOUNT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setValue("color", color)}
                  className={cn(
                    "w-7 h-7 rounded-full transition-transform",
                    selectedColor === color ? "scale-125 ring-2 ring-offset-1 ring-gray-400" : "hover:scale-110"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {account ? {t("common.save")} : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AccountsPage() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("accounts.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your bank accounts and IBANs for automatic transfer detection
          </p>
        </div>
        <button onClick={() => { setEditingAccount(null); setModalOpen(true); }} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Account
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading accounts...</div>
      ) : accounts.length === 0 ? (
        <div className="card py-16 text-center space-y-3">
          <CreditCard className="w-12 h-12 text-gray-200 mx-auto" />
          <p className="text-gray-400 text-sm">No accounts yet</p>
          <button onClick={() => setModalOpen(true)} className="btn-primary mx-auto">
            <Plus className="w-4 h-4" /> Add your first account
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="card p-5 group hover:shadow-md transition-shadow"
              style={{ borderLeft: `4px solid ${account.color ?? "#6366f1"}` }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{account.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{ACCOUNT_TYPE_LABELS[account.type]}</p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditingAccount(account); setModalOpen(true); }} className="btn-ghost p-1.5">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {account.iban && (
                <p className="mt-3 text-sm font-mono text-gray-600 bg-gray-50 rounded-lg px-3 py-2 tracking-wider">
                  {account.iban}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                <span>{account.currency}</span>
                {account.bic && <span>BIC: {account.bic}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <AccountModal
        open={modalOpen}
        account={editingAccount}
        onClose={() => { setModalOpen(false); setEditingAccount(null); }}
        onSuccess={() => {
          setModalOpen(false);
          setEditingAccount(null);
          queryClient.invalidateQueries({ queryKey: ["accounts"] });
        }}
      />
    </div>
  );
}
