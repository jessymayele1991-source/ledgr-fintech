"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/lib/db/supabase";
import { useI18n } from "@/lib/i18n/context";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setSuccess(null); setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard");
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSuccess(t("auth.confirmEmail"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.authFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-3">
          <LanguageSwitcher />
        </div>
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t("app.name")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("auth.professionalBookkeeping")}</p>
        </div>

        <div className="card p-8">
          <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setMode("login")} className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "login" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
              {t("auth.signIn")}
            </button>
            <button onClick={() => setMode("signup")} className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "signup" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
              {t("auth.signUp")}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>}
            {success && <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-700 text-sm">{success}</div>}

            <div>
              <label className="label">{t("auth.emailLabel")}</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("auth.emailPlaceholder")} className="input" />
            </div>
            <div>
              <label className="label">{t("auth.passwordLabel")}</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("auth.passwordPlaceholder")} className="input" />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 mt-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "login" ? t("auth.signIn") : t("auth.createAccount")}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          {mode === "login" ? t("auth.noAccount") : t("auth.haveAccount")}{" "}
          <button onClick={() => setMode(mode === "login" ? "signup" : "login")} className="text-indigo-600 hover:text-indigo-700 font-medium">
            {mode === "login" ? t("auth.signUp") : t("auth.signIn")}
          </button>
        </p>
      </div>
    </div>
  );
}
