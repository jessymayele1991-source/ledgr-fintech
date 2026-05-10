"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ArrowUpDown, Users, CreditCard, Tag, Upload, Download, Settings, TrendingUp, LogOut, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/db/supabase";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
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

  const handleNavClick = () => {
    onClose?.();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && onClose && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-screen transition-transform duration-200 ease-in-out",
        "md:sticky md:translate-x-0 md:w-60 md:z-auto",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        {/* Header — altijd zichtbaar bovenaan */}
        <div className="flex-shrink-0 px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-lg tracking-tight">{t("app.name")}</span>
          </div>
          {/* Close button — mobile only */}
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Scrollbaar gebied — flex-1 op nav verwijderd zodat de container kan scrollen */}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
          <nav className="px-3 py-4 space-y-0.5">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link key={href} href={href} onClick={handleNavClick} className={cn(
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
            <Link href="/settings" onClick={handleNavClick} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
              <Settings className="w-4 h-4 text-gray-400" />
              {t("nav.settings")}
            </Link>
            <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
              <LogOut className="w-4 h-4 text-gray-400" />
              {t("nav.signOut")}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
