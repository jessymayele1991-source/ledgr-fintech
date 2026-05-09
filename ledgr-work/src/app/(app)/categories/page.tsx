"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, Loader2, Tag } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { createCategorySchema } from "@/lib/validations/schemas";
import type { z } from "zod";

type CategoryForm = z.infer<typeof createCategorySchema>;

interface Category {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  color: string | null;
  icon: string | null;
  parentId: string | null;
  isSystem: boolean;
  _count?: { transactions: number };
  children?: Category[];
}

const TYPE_CONFIG = {
  INCOME: { label: "INCOME", bg: "bg-emerald-50", border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700" },
  EXPENSE: { label: "EXPENSE", bg: "bg-red-50", border: "border-red-200", badge: "bg-red-100 text-red-700" },
  TRANSFER: { label: "TRANSFER", bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-100 text-blue-700" },
};

const CATEGORY_COLORS = [
  "#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6",
  "#06b6d4","#84cc16","#f97316","#ec4899","#14b8a6",
  "#64748b","#dc2626","#0284c7","#16a34a","#9333ea",
];

async function fetchCategories(): Promise<Category[]> {
  const res = await fetch("/api/categories");
  const json = await res.json();
  return json.data ?? [];
}

async function saveCategory(data: CategoryForm, id?: string) {
  const res = await fetch(id ? `/api/categories/${id}` : "/api/categories", {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Failed to save");
  return json.data;
}

async function deleteCategory(id: string) {
  const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete");
}

function CategoryModal({
  open, category, onClose, onSuccess,
}: {
  open: boolean; category: Category | null; onClose: () => void; onSuccess: () => void;
}) {
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<CategoryForm>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: { type: "EXPENSE", color: CATEGORY_COLORS[0] },
  });

  const selectedColor = watch("color");
  const mutation = useMutation({
    mutationFn: (data: CategoryForm) => saveCategory(data, category?.id),
    onSuccess,
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{category ? "Edit Category" : "New Category"}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-4 h-4" /></button>
        </div>
        <form
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          className="p-6 space-y-4"
        >
          {mutation.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              {(mutation.error as Error).message}
            </div>
          )}

          <div>
            <label className="label">Name *</label>
            <input
              {...register("name")}
              defaultValue={category?.name}
              className={cn("input", errors.name && "border-red-300")}
              placeholder="e.g. Software Subscriptions"
            />
          </div>

          <div>
            <label className="label">Type *</label>
            <div className="grid grid-cols-3 gap-2">
              {(["INCOME", "EXPENSE", "TRANSFER"] as const).map((t) => {
                const cfg = TYPE_CONFIG[t];
                return (
                  <label key={t} className="cursor-pointer">
                    <input
                      type="radio"
                      value={t}
                      defaultChecked={category ? category.type === t : t === "EXPENSE"}
                      {...register("type")}
                      className="sr-only"
                    />
                    <div className={cn(
                      "text-center py-2 rounded-lg text-xs font-medium border-2 transition-colors",
                      watch("type") === t ? `${cfg.bg} ${cfg.border}` : "border-gray-100 hover:border-gray-200"
                    )}>
                      {cfg.label}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="label">Color</label>
            <div className="flex gap-2 flex-wrap">
              {CATEGORY_COLORS.map((color) => (
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
              {category ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });

  const grouped = {
    INCOME: categories.filter((c) => c.type === "INCOME"),
    EXPENSE: categories.filter((c) => c.type === "EXPENSE"),
    TRANSFER: categories.filter((c) => c.type === "TRANSFER"),
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("categories.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{categories.length} categories across income, expense, and transfer</p>
        </div>
        <button onClick={() => { setEditing(null); setModalOpen(true); }} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Category
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="space-y-6">
          {(["INCOME", "EXPENSE", "TRANSFER"] as const).map((type) => {
            const cfg = TYPE_CONFIG[type];
            const cats = grouped[type];
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", cfg.badge)}>
                    {cfg.label}
                  </span>
                  <span className="text-xs text-gray-400">{cats.length} categories</span>
                </div>

                {cats.length === 0 ? (
                  <div className={cn("border-2 border-dashed rounded-xl p-6 text-center", cfg.border)}>
                    <p className="text-sm text-gray-400">No {cfg.label.toLowerCase()} categories yet</p>
                    <button
                      onClick={() => { setEditing(null); setModalOpen(true); }}
                      className="mt-2 text-xs text-indigo-600 hover:underline"
                    >
                      Add one
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {cats.map((cat) => (
                      <div
                        key={cat.id}
                        className="card px-4 py-3 flex items-center gap-3 group hover:shadow-md transition-shadow"
                        style={{ borderLeft: `3px solid ${cat.color ?? "#e5e7eb"}` }}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: (cat.color ?? "#e5e7eb") + "20" }}
                        >
                          <Tag className="w-4 h-4" style={{ color: cat.color ?? "#9ca3af" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{cat.name}</p>
                          {cat._count && (
                            <p className="text-xs text-gray-400">{cat._count.transactions} transactions</p>
                          )}
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!cat.isSystem && (
                            <>
                              <button
                                onClick={() => { setEditing(cat); setModalOpen(true); }}
                                className="btn-ghost p-1.5"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => confirm("Delete this category?") && deleteMutation.mutate(cat.id)}
                                className="btn-ghost p-1.5 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {cat.isSystem && (
                            <span className="text-xs text-gray-300 px-1">system</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CategoryModal
        open={modalOpen}
        category={editing}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSuccess={() => {
          setModalOpen(false);
          setEditing(null);
          queryClient.invalidateQueries({ queryKey: ["categories"] });
        }}
      />
    </div>
  );
}
