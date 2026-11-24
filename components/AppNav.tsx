"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CloudSun,
  FileCheck2,
  LayoutDashboard,
  MapPin,
  ReceiptText,
} from "lucide-react";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
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

export function AppNav() {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <nav
      aria-label="Primary Navigation"
      className="flex items-center gap-1 overflow-x-auto py-1"
    >
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
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              isActive
                ? "bg-[#065F46] text-white shadow-sm"
                : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
