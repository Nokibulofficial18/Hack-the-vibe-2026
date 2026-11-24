import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { CloudRainWind } from "lucide-react";
import { AuthProvider } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { AppNav } from "@/components/AppNav";
import { ToastProvider } from "@/components/ToastProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "WeatherShield — Parametric Micro-Insurance Engine",
  description:
    "Automated parametric micro-insurance platform protecting smallholder farmers against extreme climate events.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialUserId = cookies().get(AUTH_COOKIE_NAME)?.value;

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-emerald-700 focus:px-4 focus:py-2 focus:text-xs focus:font-bold focus:text-white focus:shadow-lg"
        >
          Skip to main content
        </a>
        <AuthProvider initialUserId={initialUserId}>
          <ToastProvider>
            <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex flex-wrap items-center justify-between gap-4 py-3">
                  <Link
                    href="/"
                    className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-700 text-white shadow-sm">
                      <CloudRainWind className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <span className="text-base font-bold tracking-tight text-slate-950">
                        WeatherShield
                      </span>
                      <p className="text-[11px] font-medium text-slate-600">
                        Parametric Micro-Insurance Engine
                      </p>
                    </div>
                  </Link>
                  <RoleSwitcher />
                </div>
                <div className="border-t border-slate-100 py-1.5">
                  <AppNav />
                </div>
              </div>
            </header>
            <main
              id="main-content"
              className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
            >
              {children}
            </main>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
