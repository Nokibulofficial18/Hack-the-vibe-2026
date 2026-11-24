import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Hind_Siliguri } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import { LanguageProvider } from "@/lib/i18n";
import { ToastProvider } from "@/components/ToastProvider";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const hindSiliguri = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hind-siliguri",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WeatherShield Bangladesh — Parametric Micro-Insurance",
  description:
    "Automated BDT parametric micro-insurance protecting smallholder farmers across climate-vulnerable Bangladesh districts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialUserId = cookies().get(AUTH_COOKIE_NAME)?.value;

  return (
    <html lang="en" className={hindSiliguri.variable}>
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-emerald-700 focus:px-4 py-2 text-xs font-medium text-white shadow-md"
        >
          Skip to main content
        </a>
        <LanguageProvider>
          <AuthProvider initialUserId={initialUserId}>
            <ToastProvider>
              <AppShell banglaFontClass={hindSiliguri.className}>{children}</AppShell>
            </ToastProvider>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
