"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ArrowUpDown, Users, CreditCard, Tag, Upload, Download, Settings, TrendingUp, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/db/supabase";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();

  const navItems = [
    { href: "/dashboard",    label: t("nav.dashboard"),    icon: LayoutDashboard },
    { href: "/transactions", label: t("nav.transactions"), icon: ArrowUpDown },
    { href: "/clients",      label: t("nav.clients"),      icon: Users },
    { href: "/accounts",     label: t("nav.accounts"),     icon: CreditCard },
    { href: "/categories",   label: t("nav.categories"),   icon: Tag },
    { href: "/import",       label: t("nav.import"),       icon: Upload },
    { href: "/export",       label: t("nav.export"),       icon: Download },
  ];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return (
    <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg tracking-tight">{t("app.name")}</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              active ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            )}>
              <Icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-indigo-600" : "text-gray-400")} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-gray-100 space-y-0.5">
        <Link href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
          <Settings className="w-4 h-4 text-gray-400" />
          {t("nav.settings")}
        </Link>
        <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
          <LogOut className="w-4 h-4 text-gray-400" />
          {t("nav.signOut")}
        </button>
      </div>
    </aside>
  );
}
