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
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/farms", label: "Farms", icon: MapPin },
  { href: "/policies", label: "Policies", icon: FileCheck2 },
  { href: "/dashboard", label: "Weather Monitor", icon: CloudSun },
  { href: "/claims", label: "Claim Ledger", icon: ReceiptText },
] as const;

export function AppNav() {
  const pathname = usePathname();

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
                ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
