"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Phone,
  Save,
  Smartphone,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
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
      setPhoneError(check.valid ? null : (check.error ?? "Invalid BD mobile number."));
    } else {
      setPhoneError("Mobile number is required in +8801XXXXXXXXX format.");
    }
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    const check = validateBdMobileNumber(mobileNumber);
    if (!check.valid) {
      const errMsg = check.error ?? "Invalid Bangladesh mobile number.";
      setPhoneError(errMsg);
      toast({
        variant: "error",
        title: "Invalid Bangladesh Mobile Number",
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
        const msg = data.error ?? "Failed to update payout wallet.";
        setPhoneError(msg);
        toast({ variant: "error", title: "Wallet Update Failed", description: msg });
        return;
      }

      const meta = getPayoutMethodMeta(payoutMethod);
      setMobileNumber(check.normalized);
      setPhoneError(null);
      toast({
        variant: "success",
        title: "Mobile Payout Wallet Saved",
        description: `${data.user?.name ?? user.name} will receive automatic payouts via ${meta.label} (${maskBdMobileNumber(check.normalized)}).`,
      });
      await loadProfile();
      router.refresh();
    } catch {
      toast({
        variant: "error",
        title: "Network Error",
        description: "Unable to save mobile payout wallet.",
      });
    } finally {
      setSaving(false);
    }
  };

  const activeMeta = getPayoutMethodMeta(payoutMethod);

  return (
    <section
      aria-labelledby="mobile-wallet-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900 ring-1 ring-emerald-200">
            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
            Bangladesh MFS Auto-Disbursement Channel
          </div>
          <h2 id="mobile-wallet-heading" className="mt-1.5 text-base font-bold text-slate-950">
            {isAdmin ? "Farmer Mobile Wallet Configuration" : "My Mobile Payout Wallet"}
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Parametric claim payouts are sent automatically to your verified{" "}
            <strong>bKash</strong>, <strong>Nagad</strong>, or <strong>Rocket</strong> account.
          </p>
        </div>

        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
            activeMeta.badgeClass
          )}
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          {activeMeta.label} · {maskBdMobileNumber(mobileNumber)}
        </span>
      </div>

      {loading ? (
        <p className="py-6 text-center text-xs text-slate-500">Loading wallet settings...</p>
      ) : (
        <form onSubmit={handleSave} noValidate className="mt-4 space-y-4">
          {isAdmin && farmers.length > 0 && (
            <div>
              <label htmlFor="wallet-farmer-select" className="block text-xs font-bold text-slate-800">
                Select Farmer Profile
              </label>
              <select
                id="wallet-farmer-select"
                value={targetUserId}
                onChange={(e) => handleSelectFarmer(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none sm:max-w-sm"
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
            {/* Provider Radio Cards */}
            <div className="lg:col-span-5">
              <span className="block text-xs font-bold text-slate-800">
                Mobile Financial Service (MFS)
              </span>
              <div
                role="radiogroup"
                aria-label="Mobile payout provider"
                className="mt-1.5 grid grid-cols-3 gap-2"
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
                        "rounded-xl border px-3 py-2 text-center text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600",
                        selected
                          ? cn("border-transparent shadow-sm", opt.headerBgClass)
                          : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Strict BD Phone Input */}
            <div className="lg:col-span-5">
              <label htmlFor="bd-mobile-number" className="block text-xs font-bold text-slate-800">
                Bangladesh Mobile Number (+8801XXXXXXXXX)
              </label>
              <div className="relative mt-1.5">
                <Phone
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
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
                    "w-full rounded-lg border py-2 pl-9 pr-3 font-mono text-xs font-semibold text-slate-950 focus:outline-none focus:ring-2",
                    phoneError
                      ? "border-rose-500 bg-rose-50/40 focus:border-rose-600 focus:ring-rose-500/25"
                      : "border-slate-300 focus:border-emerald-600 focus:ring-emerald-600/20"
                  )}
                />
              </div>
              {phoneError ? (
                <p
                  id="bd-phone-error"
                  role="alert"
                  className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-rose-700"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {phoneError}
                </p>
              ) : (
                <p id="bd-phone-hint" className="mt-1 text-[11px] text-slate-600">
                  Valid prefixes: +88013–+88019 · Receipt preview: {maskBdMobileNumber(mobileNumber)}
                </p>
              )}
            </div>

            {/* Save Button */}
            <div className="lg:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                {saving ? "Saving..." : "Save Wallet"}
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
