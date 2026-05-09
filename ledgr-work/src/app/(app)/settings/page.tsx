"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Zap, Shield, BookOpen, X, Loader2, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";

interface LearningRule {
  id: string;
  counterpartyIban: string | null;
  merchantNameContains: string | null;
  descriptionContains: string | null;
  categoryName: string;
  category: { name: string; type: string; color: string | null };
  createdAt: string;
}

interface Category {
  id: string;
  name: string;
  type: string;
  color: string | null;
}

async function fetchRules(): Promise<LearningRule[]> {
  const res = await fetch("/api/rules");
  const json = await res.json();
  return json.data ?? [];
}

async function fetchCategories(): Promise<Category[]> {
  const res = await fetch("/api/categories");
  const json = await res.json();
  return json.data ?? [];
}

async function deleteRule(id: string) {
  await fetch(`/api/rules/${id}`, { method: "DELETE" });
}

async function createRule(data: {
  counterpartyIban?: string;
  merchantNameContains?: string;
  descriptionContains?: string;
  categoryId: string;
}) {
  const res = await fetch("/api/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Failed to create rule");
  return json.data;
}

async function runAutoCategorizaton(minConfidence: number, dryRun: boolean) {
  const res = await fetch("/api/categorize", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minConfidence, dryRun }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Failed");
  return json.data;
}

// ── New Rule Form ─────────────────────────────────────────────────────────────

function NewRuleForm({
  categories,
  onSuccess,
  onCancel,
}: {
  categories: Category[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [iban, setIban] = useState("");
  const [merchant, setMerchant] = useState("");
  const [desc, setDesc] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: createRule,
    onSuccess,
    onError: (e) => setError((e as Error).message),
  });

  const handleSubmit = () => {
    if (!categoryId) { setError("Please select a category"); return; }
    if (!iban && !merchant && !desc) { setError("At least one matching condition required"); return; }
    mutation.mutate({
      counterpartyIban: iban || undefined,
      merchantNameContains: merchant || undefined,
      descriptionContains: desc || undefined,
      categoryId,
    });
  };

  return (
    <div className="card p-5 space-y-4 border-indigo-200 bg-indigo-50/30">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">New Rule</h3>
        <button onClick={onCancel} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
      </div>

      {error && (
        <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Fill in one or more matching conditions. This rule will always override AI suggestions.
      </p>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="label">Counterparty IBAN (exact match)</label>
          <input
            value={iban}
            onChange={(e) => setIban(e.target.value.toUpperCase().replace(/\s/g, ""))}
            className="input font-mono"
            placeholder="e.g. LU89751000135104200E"
          />
        </div>
        <div>
          <label className="label">Merchant name contains</label>
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            className="input"
            placeholder="e.g. PayPal, Albert Heijn, ODIDO"
          />
        </div>
        <div>
          <label className="label">Description contains</label>
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="input"
            placeholder="e.g. PAYPAL, factuur, maandelijks"
          />
        </div>
        <div>
          <label className="label">Assign to category *</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input"
          >
            <option value="">Select category…</option>
            {["INCOME", "EXPENSE", "TRANSFER"].map((type) => (
              <optgroup key={type} label={type}>
                {categories
                  .filter((c) => c.type === type)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
        <button
          onClick={handleSubmit}
          disabled={mutation.isPending}
          className="btn-primary flex-1"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Save Rule
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [showNewRule, setShowNewRule] = useState(false);
  const [autoResult, setAutoResult] = useState<{ applied: number; skipped: number; dryRun: boolean } | null>(null);
  const [minConfidence, setMinConfidence] = useState(75);
  const [autoLoading, setAutoLoading] = useState(false);

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ["rules"],
    queryFn: fetchRules,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rules"] }),
  });

  const handleAutoApply = async (dryRun: boolean) => {
    setAutoLoading(true);
    try {
      const result = await runAutoCategorizaton(minConfidence, dryRun);
      setAutoResult(result);
      if (!dryRun) {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setAutoLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("settings.title")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("settings.subtitle")}</p>
      </div>

      {/* Language & Region */}
      <div className="card p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Globe className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">{t("settings.sectionLanguage")}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{t("settings.languageHint")}</p>
          </div>
        </div>
        <div>
          <label className="label">{t("settings.languageLabel")}</label>
          <div className="mt-2">
            <LanguageSwitcher variant="inline" />
          </div>
        </div>
      </div>

            {/* AI Auto-Categorize */}
      <div className="card p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">{t("settings.aiTitle")}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {t("settings.aiDescription")}
            </p>
          </div>
        </div>

        <div>
          <label className="label">{t("settings.confidence", { value: minConfidence })}</label>
          <input
            type="range"
            min={50}
            max={95}
            step={5}
            value={minConfidence}
            onChange={(e) => setMinConfidence(parseInt(e.target.value))}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>50% (more matches)</span>
            <span>95% (only high-confidence)</span>
          </div>
        </div>

        {autoResult && (
          <div className={cn(
            "flex items-center gap-3 rounded-xl px-4 py-3 text-sm",
            autoResult.dryRun ? "bg-amber-50 border border-amber-200 text-amber-800"
              : "bg-emerald-50 border border-emerald-200 text-emerald-800"
          )}>
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {autoResult.dryRun
              ? `Preview: ${autoResult.applied} would be categorized, ${autoResult.skipped} skipped`
              : `Applied: ${autoResult.applied} transactions categorized, ${autoResult.skipped} skipped`}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => handleAutoApply(true)}
            disabled={autoLoading}
            className="btn-secondary flex-1"
          >
            {autoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Preview (dry run)
          </button>
          <button
            onClick={() => handleAutoApply(false)}
            disabled={autoLoading}
            className="btn-primary flex-1"
          >
            {autoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Apply to All Uncategorized
          </button>
        </div>
      </div>

      {/* User Learning Rules */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-500" />
              {t("settings.sectionRules")}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {rules.length === 1 ? t("settings.rulesActive", { count: rules.length }) : t("settings.rulesActivePlural", { count: rules.length })}
            </p>
          </div>
          {!showNewRule && (
            <button
              onClick={() => setShowNewRule(true)}
              className="btn-primary text-sm"
            >
              <Plus className="w-4 h-4" /> New Rule
            </button>
          )}
        </div>

        {showNewRule && (
          <NewRuleForm
            categories={categories}
            onSuccess={() => {
              setShowNewRule(false);
              queryClient.invalidateQueries({ queryKey: ["rules"] });
            }}
            onCancel={() => setShowNewRule(false)}
          />
        )}

        {rulesLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Loading rules…</div>
        ) : rules.length === 0 && !showNewRule ? (
          <div className="card p-8 text-center space-y-3">
            <BookOpen className="w-8 h-8 text-gray-300 mx-auto" />
            <p className="text-gray-500 text-sm">No custom rules yet.</p>
            <p className="text-gray-400 text-xs">
              {t("settings.noRulesHint")}
            </p>
            <button onClick={() => setShowNewRule(true)} className="btn-primary mx-auto">
              <Plus className="w-4 h-4" /> Add your first rule
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div key={rule.id} className="card px-4 py-3 flex items-center gap-3 group">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap gap-2">
                    {rule.counterpartyIban && (
                      <span className="text-xs bg-gray-100 text-gray-600 font-mono px-2 py-0.5 rounded">
                        IBAN: {rule.counterpartyIban.slice(0, 12)}…
                      </span>
                    )}
                    {rule.merchantNameContains && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                        Merchant: "{rule.merchantNameContains}"
                      </span>
                    )}
                    {rule.descriptionContains && (
                      <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                        Desc: "{rule.descriptionContains}"
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">→</span>
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full border"
                      style={{
                        borderColor: rule.category.color ?? "#e5e7eb",
                        color: rule.category.color ?? "#6b7280",
                      }}
                    >
                      {rule.categoryName}
                    </span>
                    <span className="text-xs text-gray-300">
                      {rule.category.type.toLowerCase()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(rule.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity btn-ghost p-1.5 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
