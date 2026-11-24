"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Phone, Save, Smartphone } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import {
  PAYOUT_METHOD_OPTIONS,
  getPayoutMethodMeta,
  maskBdMobileNumber,
  validateBdMobileNumber,
  type PayoutMethodType,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

interface FarmerWalletInfo {
  id: string;
  name: string;
  email: string;
  payoutMethod: PayoutMethodType;
  mobileNumber: string;
}

export function MobileWalletCard() {
  const { user, isAdmin, getAuthHeaders } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();

  const [farmers, setFarmers] = useState<FarmerWalletInfo[]>([]);
  const [targetUserId, setTargetUserId] = useState<string>(user.id);
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethodType>(user.payoutMethod);
  const [mobileNumber, setMobileNumber] = useState<string>(user.mobileNumber);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/users", {
        headers: getAuthHeaders(),
        cache: "no-store",
      });
      if (response.ok) {
        const data = (await response.json()) as {
          currentUser: FarmerWalletInfo;
          farmers: FarmerWalletInfo[];
        };
        if (isAdmin && data.farmers.length > 0) {
          setFarmers(data.farmers);
          const selected =
            data.farmers.find((f) => f.id === targetUserId) ?? data.farmers[0];
          setTargetUserId(selected.id);
          setPayoutMethod(selected.payoutMethod);
          setMobileNumber(selected.mobileNumber);
        } else {
          setFarmers([]);
          setTargetUserId(data.currentUser.id);
          setPayoutMethod(data.currentUser.payoutMethod);
          setMobileNumber(data.currentUser.mobileNumber);
        }
        setPhoneError(null);
      }
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, isAdmin, targetUserId]);

  useEffect(() => {
    setTargetUserId(user.id);
    void loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const handleSelectFarmer = (farmerId: string) => {
    setTargetUserId(farmerId);
    const chosen = farmers.find((f) => f.id === farmerId);
    if (chosen) {
      setPayoutMethod(chosen.payoutMethod);
      setMobileNumber(chosen.mobileNumber);
      setPhoneError(null);
    }
  };

  const handlePhoneChange = (value: string) => {
    setMobileNumber(value);
    if (value.trim().length > 0) {
      const check = validateBdMobileNumber(value);
      setPhoneError(check.valid ? null : t("walletPhoneRequired"));
    } else {
      setPhoneError(t("walletPhoneRequired"));
    }
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    const check = validateBdMobileNumber(mobileNumber);
    if (!check.valid) {
      const errMsg = t("walletPhoneRequired");
      setPhoneError(errMsg);
      toast({
        variant: "error",
        title: t("walletInvalidPhoneTitle"),
        description: errMsg,
      });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          userId: targetUserId,
          payoutMethod,
          mobileNumber: check.normalized,
        }),
      });

      const data = (await response.json()) as {
        user?: FarmerWalletInfo;
        error?: string;
      };

      if (!response.ok) {
        const msg = data.error ?? t("walletUpdateFailedDesc");
        setPhoneError(msg);
        toast({ variant: "error", title: t("walletUpdateFailedTitle"), description: msg });
        return;
      }

      const meta = getPayoutMethodMeta(payoutMethod);
      setMobileNumber(check.normalized);
      setPhoneError(null);
      toast({
        variant: "success",
        title: t("walletSavedTitle"),
        description: `${data.user?.name ?? user.name} → ${meta.label} (${maskBdMobileNumber(check.normalized)})`,
      });
      await loadProfile();
      router.refresh();
    } catch {
      toast({
        variant: "error",
        title: t("networkErrorTitle"),
        description: t("walletNetworkErrDesc"),
      });
    } finally {
      setSaving(false);
    }
  };

  const activeMeta = getPayoutMethodMeta(payoutMethod);

  return (
    <section
      aria-labelledby="mobile-wallet-heading"
      className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Smartphone className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h2 id="mobile-wallet-heading" className="text-sm font-semibold text-slate-900">
              {isAdmin ? t("adminMobileWallet") : t("myMobileWallet")}
            </h2>
            <p className="text-xs text-slate-600">{t("walletSubtitle")}</p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {activeMeta.label} · {maskBdMobileNumber(mobileNumber)}
        </span>
      </div>

      {loading ? (
        <div className="mt-4 h-12 animate-pulse rounded-lg bg-slate-100" />
      ) : (
        <form onSubmit={handleSave} noValidate className="mt-4 space-y-4">
          {isAdmin && farmers.length > 0 && (
            <div className="max-w-sm">
              <label htmlFor="wallet-farmer-select" className="block text-xs font-medium text-slate-600">
                {t("selectFarmerProfile")}
              </label>
              <select
                id="wallet-farmer-select"
                value={targetUserId}
                onChange={(e) => handleSelectFarmer(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 shadow-xs focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
              >
                {farmers.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({getPayoutMethodMeta(f.payoutMethod).label} · {maskBdMobileNumber(f.mobileNumber)})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-5">
              <span className="block text-xs font-medium text-slate-600">
                {t("mfsProviderLabel")}
              </span>
              <div
                role="radiogroup"
                aria-label={t("mfsProviderLabel")}
                className="mt-1.5 grid grid-cols-3 gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50 p-1"
              >
                {PAYOUT_METHOD_OPTIONS.map((opt) => {
                  const selected = payoutMethod === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setPayoutMethod(opt.id)}
                      className={cn(
                        "whitespace-nowrap rounded-md py-1.5 text-center text-xs font-medium transition",
                        selected
                          ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-600/20"
                          : "text-slate-600 hover:bg-white hover:text-slate-900"
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-5">
              <label htmlFor="bd-mobile-number" className="block text-xs font-medium text-slate-600">
                {t("bdPhoneLabel")}
              </label>
              <div className="relative mt-1.5">
                <Phone
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="bd-mobile-number"
                  type="tel"
                  placeholder="+8801712345678"
                  value={mobileNumber}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  aria-invalid={Boolean(phoneError)}
                  aria-describedby={phoneError ? "bd-phone-error" : "bd-phone-hint"}
                  className={cn(
                    "w-full rounded-lg border py-2 pl-9 pr-3 font-mono text-xs text-slate-900 shadow-xs focus:outline-none focus:ring-2",
                    phoneError
                      ? "border-rose-300 bg-rose-50/40 focus:border-rose-500 focus:ring-rose-500/15"
                      : "border-slate-200 bg-white focus:border-emerald-700 focus:ring-emerald-700/15"
                  )}
                />
              </div>
              {phoneError ? (
                <p
                  id="bd-phone-error"
                  role="alert"
                  className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-600"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {phoneError}
                </p>
              ) : (
                <p id="bd-phone-hint" className="mt-1 text-[11px] text-slate-500">
                  {t("maskedReceiptPreview", { phone: maskBdMobileNumber(mobileNumber) })}
                </p>
              )}
            </div>

            <div className="lg:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm shadow-emerald-600/20 transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{saving ? t("saving") : t("saveWallet")}</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
