"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CloudRainWind,
  CloudSun,
  FileCheck2,
  FlaskConical,
  Globe,
  LayoutDashboard,
  MapPin,
  Menu,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Sprout,
  X,
} from "lucide-react";
import { useAuth, type UserRole } from "@/lib/auth";
import { useTranslation, type Language, type TranslationKey } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import { JudgeDemoDrawer } from "@/components/JudgeDemoDrawer";
import { cn } from "@/lib/utils";

const NAV_ITEMS: ReadonlyArray<{
  href: string;
  labelKey: TranslationKey;
  icon: typeof LayoutDashboard;
}> = [
  { href: "/", labelKey: "navOverview", icon: LayoutDashboard },
  { href: "/farms", labelKey: "navFarms", icon: MapPin },
  { href: "/policies", labelKey: "navPolicies", icon: FileCheck2 },
  { href: "/dashboard", labelKey: "navMonitor", icon: CloudSun },
  { href: "/claims", labelKey: "navClaims", icon: ReceiptText },
];

export function AppShell({
  children,
  banglaFontClass,
}: {
  children: ReactNode;
  banglaFontClass?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, users, isAdmin, switchRole, switchUser, getAuthHeaders } = useAuth();
  const { lang, isBangla, setLang, t, translatePerson } = useTranslation();
  const { toast } = useToast();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [judgeDrawerOpen, setJudgeDrawerOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const currentNav =
    NAV_ITEMS.find((item) =>
      item.href === "/"
        ? pathname === "/"
        : pathname === item.href || pathname.startsWith(`${item.href}/`)
    ) ?? NAV_ITEMS[0];

  const handleLanguageChange = (nextLang: Language) => {
    if (nextLang === lang) return;
    setLang(nextLang);
    toast({
      variant: "info",
      title:
        nextLang === "bn"
          ? "ভাষা বাংলায় পরিবর্তন করা হয়েছে"
          : "Language switched to English",
      description:
        nextLang === "bn"
          ? "মেনু, পলিসি স্ট্যাটাস এবং অর্থপ্রদানের বিজ্ঞপ্তি এখন বাংলায় প্রদর্শিত হচ্ছে।"
          : "Navigation, policy statuses, and payout notifications are now in English.",
    });
  };

  const handleRoleSwitch = (role: UserRole) => {
    if (role === user.role) return;
    switchRole(role);
    if (role !== "ADMIN") setJudgeDrawerOpen(false);
    toast({
      variant: "info",
      title: role === "ADMIN" ? t("roleSwitchedAdmin") : t("roleSwitchedFarmer"),
      description:
        role === "ADMIN" ? t("roleSwitchedAdminDesc") : t("roleSwitchedFarmerDesc"),
    });
    router.refresh();
  };

  const handleUserSwitch = (userId: string) => {
    const target = users.find((u) => u.id === userId);
    switchUser(userId);
    if (target) {
      if (target.role !== "ADMIN") setJudgeDrawerOpen(false);
      toast({
        variant: "info",
        title: t("activeAccountToast", { name: translatePerson(target.name) }),
        description: `${target.role === "ADMIN" ? t("roleAdmin") : t("roleFarmer")} · ${target.email}`,
      });
    }
    router.refresh();
  };

  const handleDemoReset = async () => {
    const confirmed = window.confirm(t("confirmDemoReset"));
    if (!confirmed) return;

    setResetting(true);
    try {
      const response = await fetch("/api/demo/reset", {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        toast({
          variant: "error",
          title: t("demoResetFailedTitle"),
          description: data.error ?? t("demoResetFailedDesc"),
        });
        return;
      }
      toast({
        variant: "success",
        title: t("demoResetSuccessTitle"),
        description: t("demoResetSuccessDesc"),
      });
      router.refresh();
      window.location.reload();
    } catch {
      toast({
        variant: "error",
        title: t("networkErrorTitle"),
        description: t("networkErrorReset"),
      });
    } finally {
      setResetting(false);
    }
  };

  const renderSidebarBody = () => (
    <div className="flex h-full flex-col justify-between">
      {/* Top Brand + Primary Nav */}
      <div>
        <div className="flex h-16 items-center justify-between border-b border-slate-200/80 px-5">
          <Link
            href="/"
            onClick={() => setMobileSidebarOpen(false)}
            className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-600/20">
              <CloudRainWind className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold tracking-tight text-slate-900">
                {t("brandName")}
              </span>
              <p className="truncate text-[11px] text-slate-500">{t("brandTagline")}</p>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label={t("closeMenuAria")}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-3 py-4">
          <p className="px-3 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            {t("workspaceSection")}
          </p>
          <nav aria-label="Primary Navigation" className="mt-2 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileSidebarOpen(false)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all",
                    isActive
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-600/20"
                      : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                  )}
                >
                  <Icon
                    className={cn("h-4 w-4 shrink-0", isActive ? "text-white" : "text-slate-400")}
                    aria-hidden="true"
                  />
                  <span className="truncate">{t(item.labelKey)}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Role Switcher & Account Context */}
      <div className="space-y-3 border-t border-slate-200/80 bg-slate-50/50 p-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            {t("roleContext")}
          </p>
          <div
            role="group"
            aria-label={t("roleContext")}
            className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-slate-200/80 bg-white p-1"
          >
            <button
              type="button"
              onClick={() => handleRoleSwitch("FARMER")}
              aria-pressed={user.role === "FARMER"}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition-all",
                user.role === "FARMER"
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-600/20"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Sprout className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t("roleFarmer")}</span>
            </button>
            <button
              type="button"
              onClick={() => handleRoleSwitch("ADMIN")}
              aria-pressed={user.role === "ADMIN"}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition-all",
                user.role === "ADMIN"
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-600/20"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t("roleAdmin")}</span>
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="sidebar-persona-select"
            className="block text-[11px] font-medium text-slate-500"
          >
            {t("activeAccount")}
          </label>
          <select
            id="sidebar-persona-select"
            value={user.id}
            onChange={(e) => handleUserSwitch(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-800 shadow-xs focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
          >
            {users.map((account) => (
              <option key={account.id} value={account.id}>
                {translatePerson(account.name)} ({account.role === "ADMIN" ? t("roleAdmin") : t("roleFarmer")})
              </option>
            ))}
          </select>
          <p className="mt-1 truncate text-[11px] text-slate-500">{user.email}</p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={handleDemoReset}
            disabled={resetting}
            className="inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
          >
            <RotateCcw
              className={cn("h-3.5 w-3.5 shrink-0", resetting && "animate-spin")}
              aria-hidden="true"
            />
            <span>{resetting ? t("resetting") : t("demoReset")}</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-50/80 via-slate-50 to-teal-50/40 text-slate-900",
        isBangla && "font-bangla leading-relaxed",
        isBangla && banglaFontClass
      )}
    >
      {/* Desktop Fixed Left Sidebar (w-64) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200/80 bg-white lg:block">
        {renderSidebarBody()}
      </aside>

      {/* Mobile Collapsible Sidebar Drawer */}
      {mobileSidebarOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Drawer"
          className="fixed inset-0 z-50 flex bg-slate-900/30 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="h-full w-64 border-r border-slate-200 bg-white shadow-xl"
          >
            {renderSidebarBody()}
          </aside>
        </div>
      )}

      {/* Right Content Column */}
      <div className="flex min-h-screen flex-col lg:pl-64">
        {/* Clean Glassmorphism Sticky Top Header */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200/70 bg-white/75 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label={t("openMenuAria")}
              className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 lg:hidden"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="truncate font-semibold text-slate-900">
                {t(currentNav.labelKey)}
              </span>
              <span className="hidden text-slate-300 sm:inline">/</span>
              <span className="hidden truncate text-xs text-slate-500 sm:inline">
                {translatePerson(user.name)} ·{" "}
                <span className="font-medium text-slate-700">
                  {user.role === "ADMIN" ? t("roleAdmin") : t("roleFarmer")}
                </span>
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            {/* Language Switcher (EN | বাংলা) */}
            <div
              role="group"
              aria-label={t("langToggleAria")}
              className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50/80 p-0.5"
            >
              <Globe className="ml-2 mr-1 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              <button
                type="button"
                onClick={() => handleLanguageChange("en")}
                aria-pressed={lang === "en"}
                className={cn(
                  "whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition",
                  lang === "en"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange("bn")}
                aria-pressed={lang === "bn"}
                className={cn(
                  "whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition",
                  lang === "bn"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                বাংলা
              </button>
            </div>

            {/* Subtle Top-Header Trigger for Admin Slide-Over Judge Demo Panel */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setJudgeDrawerOpen(true)}
                aria-expanded={judgeDrawerOpen}
                aria-label={t("judgeDemoAria")}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs transition hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                <FlaskConical className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
                <span>{t("judgeDemoBtn")}</span>
                <span className="hidden rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 sm:inline">
                  A06·A07
                </span>
              </button>
            )}
          </div>
        </header>

        {/* Main Workspace Container */}
        <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Slide-Over Judge Demo Drawer (Admin Only) */}
      <JudgeDemoDrawer open={judgeDrawerOpen} onClose={() => setJudgeDrawerOpen(false)} />
    </div>
  );
}
