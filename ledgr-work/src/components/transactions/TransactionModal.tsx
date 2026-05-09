"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { createTransactionSchema } from "@/lib/validations/schemas";
import type { Transaction } from "@/types";
import type { z } from "zod";

type FormData = z.infer<typeof createTransactionSchema>;

interface Props {
  open: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onSuccess: () => void;
}

async function saveTransaction(data: FormData, id?: string) {
  const url = id ? `/api/transactions/${id}` : "/api/transactions";
  const method = id ? "PATCH" : "POST";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Failed to save transaction");
  return json.data;
}

async function fetchAccounts() {
  const res = await fetch("/api/accounts");
  const json = await res.json();
  return json.data ?? [];
}

async function fetchCategories() {
  const res = await fetch("/api/categories");
  const json = await res.json();
  return json.data ?? [];
}

async function fetchClients() {
  const res = await fetch("/api/clients");
  const json = await res.json();
  return json.data ?? [];
}

export function TransactionModal({ open, transaction, onClose, onSuccess }: Props) {
  const { t } = useI18n();
  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: fetchClients });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: {
      currency: "EUR",
      type: "EXPENSE",
      date: new Date().toISOString(),
    },
  });

  const type = watch("type");
  const amount = watch("amount");

  // Auto-compute signedAmount when type or amount changes
  useEffect(() => {
    if (amount) {
      const signed = type === "INCOME" ? Math.abs(amount) : type === "EXPENSE" ? -Math.abs(amount) : amount;
      setValue("signedAmount", signed);
    }
  }, [type, amount, setValue]);

  useEffect(() => {
    if (open) {
      if (transaction) {
        reset({
          date: transaction.date instanceof Date ? transaction.date.toISOString() : transaction.date,
          amount: transaction.amount,
          signedAmount: transaction.signedAmount,
          currency: transaction.currency,
          type: transaction.type,
          categoryId: transaction.categoryId ?? undefined,
          clientId: transaction.clientId ?? undefined,
          accountId: transaction.accountId ?? undefined,
          counterpartyName: transaction.counterpartyName ?? undefined,
          counterpartyIban: transaction.counterpartyIban ?? undefined,
          description: transaction.description ?? undefined,
          reference: transaction.reference ?? undefined,
          notes: transaction.notes ?? undefined,
        });
      } else {
        reset({
          currency: "EUR",
          type: "EXPENSE",
          date: new Date().toISOString(),
        });
      }
    }
  }, [open, transaction, reset]);

  const mutation = useMutation({
    mutationFn: (data: FormData) => saveTransaction(data, transaction?.id),
    onSuccess,
  });

  const onSubmit = handleSubmit((data) => mutation.mutate(data));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-base font-semibold text-gray-900">
            {transaction ? "Edit Transaction" : "New Transaction"}
          </h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          {mutation.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              {(mutation.error as Error).message}
            </div>
          )}

          {/* Type */}
          <div>
            <label className="label">Type</label>
            <div className="grid grid-cols-4 gap-2">
              {(["INCOME", "EXPENSE", "TRANSFER", "REFUND"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setValue("type", t)}
                  className={cn(
                    "py-2 px-3 rounded-lg text-xs font-medium border transition-colors",
                    type === t
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                  )}
                >
                  {t.charAt(0) + t.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Date */}
            <div>
              <label className="label">Date *</label>
              <input
                type="date"
                {...register("date", {
                  setValueAs: (v) => v ? new Date(v).toISOString() : v,
                })}
                defaultValue={new Date().toISOString().slice(0, 10)}
                className={cn("input", errors.date && "border-red-300")}
              />
              {errors.date && <p className="text-red-500 text-xs mt-1">{errors.date.message}</p>}
            </div>

            {/* Amount */}
            <div>
              <label className="label">Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...register("amount", { valueAsNumber: true })}
                  className={cn("input pl-7", errors.amount && "border-red-300")}
                />
              </div>
              {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="label">Description</label>
            <input
              type="text"
              placeholder="What is this transaction for?"
              {...register("description")}
              className="input"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Category */}
            <div>
              <label className="label">Category</label>
              <select {...register("categoryId")} className="input">
                <option value="">No category</option>
                {categories.map((cat: { id: string; name: string; type: string }) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Account */}
            <div>
              <label className="label">Account</label>
              <select {...register("accountId")} className="input">
                <option value="">No account</option>
                {accounts.map((acc: { id: string; name: string }) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Client */}
            <div>
              <label className="label">Client</label>
              <select {...register("clientId")} className="input">
                <option value="">No client</option>
                {clients.map((c: { id: string; name: string }) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Currency */}
            <div>
              <label className="label">Currency</label>
              <input type="text" maxLength={3} {...register("currency")} className="input uppercase" />
            </div>
          </div>

          {/* Counterparty */}
          <div>
            <label className="label">Counterparty Name</label>
            <input
              type="text"
              placeholder="Company or person name"
              {...register("counterpartyName")}
              className="input"
            />
          </div>

          <div>
            <label className="label">Counterparty IBAN</label>
            <input
              type="text"
              placeholder="NL00 BANK 0000 0000 00"
              {...register("counterpartyIban")}
              className="input uppercase font-mono text-sm"
            />
          </div>

          {/* Reference */}
          <div>
            <label className="label">Reference</label>
            <input type="text" placeholder="Invoice number, reference..." {...register("reference")} className="input" />
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes</label>
            <textarea
              rows={2}
              placeholder="Internal notes..."
              {...register("notes")}
              className="input resize-none"
            />
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || mutation.isPending}
              className="btn-primary flex-1"
            >
              {(isSubmitting || mutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
              {transaction ? "Save Changes" : "Add Transaction"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
