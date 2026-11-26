"use client";

import {
  CheckCircle2,
  Copy,
  Printer,
  Receipt,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import { getMetricMeta, maskBdMobileNumber } from "@/lib/domain";
import { cn } from "@/lib/utils";

export interface ReceiptClaimData {
  id: string;
  idempotencyKey: string;
  triggerValue: number;
  payoutAmount: number;
  severityTier: string | null;
  payoutPercentage: number | null;
  payoutMethod: string | null;
  recipientPhone: string | null;
  transactionId: string | null;
  disbursedAt: string | null;
  createdAt: string;
  policy: {
    metricType: string;
    thresholdValue: number;
    coverageAmount: number;
    farm: {
      name: string;
      cropType: string;
      user: {
        name: string;
        email: string;
        payoutMethod?: string;
        mobileNumber?: string;
      };
    };
  };
}

export function DisbursementReceiptCard({
  claim,
  compact = false,
}: {
  claim: ReceiptClaimData;
  compact?: boolean;
}) {
  const {
    t,
    translateStatus,
    translateMfs,
    translateMfsTagline,
    translatePerson,
    translateFarmName,
    translateCrop,
    translateMetricShort,
    translateUnit,
    formatNum,
    formatTaka,
    formatDateTime,
  } = useTranslation();
  const { toast } = useToast();
  const method = claim.payoutMethod ?? claim.policy.farm.user.payoutMethod ?? "BKASH";
  const mfsLabel = translateMfs(method);
  const mfsTagline = translateMfsTagline(method);
  const metric = getMetricMeta(claim.policy.metricType);
  const unitLabel = translateUnit(metric.unit);
  const rawPhone = claim.recipientPhone ?? claim.policy.farm.user.mobileNumber ?? "+8801711000000";
  const maskedPhone = formatNum(maskBdMobileNumber(rawPhone));
  const txnId = claim.transactionId ?? `SIM-${claim.id.slice(0, 10).toUpperCase()}`;
  const settledAt = claim.disbursedAt ?? claim.createdAt;
  const tierLabel =
    claim.severityTier === "SEVERE"
      ? t("severeBreachBadge", { pct: claim.payoutPercentage ?? 100 })
      : claim.severityTier === "MODERATE"
        ? t("moderateBreachBadge", { pct: claim.payoutPercentage ?? 50 })
        : t("parametricSettlementBadge");

  const handleCopyTxn = async () => {
    try {
      await navigator.clipboard.writeText(txnId);
      toast({
        variant: "success",
        title: t("txnCopiedTitle"),
        description: `${mfsLabel}: ${txnId}`,
      });
    } catch {
      toast({
        variant: "info",
        title: t("txnIdLabel", { method: mfsLabel }),
        description: txnId,
      });
    }
  };

  return (
    <div
      aria-label={t("receiptTitle", { method: mfsLabel })}
      className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs"
    >
      {/* Minimalist Receipt Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Smartphone className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              {mfsTagline}
            </p>
            <h3 className="text-sm font-semibold text-slate-900">
              {t("receiptTitle", { method: mfsLabel })}
            </h3>
          </div>
        </div>

        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
          <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{translateStatus("DISBURSED")}</span>
        </span>
      </div>

      {/* Amount & Tier Summary */}
      <div className="border-b border-dashed border-slate-200 bg-slate-50/70 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              {t("amountCreditedLabel")}
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              {formatTaka(claim.payoutAmount)}
            </p>
          </div>
          <div className="text-right">
            <span
              className={cn(
                "inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                claim.severityTier === "SEVERE"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              )}
            >
              {tierLabel}
            </span>
            <p className="mt-1 text-[11px] text-slate-500">
              {t("ofPolicyCoverage", { amount: formatTaka(claim.policy.coverageAmount) })}
            </p>
          </div>
        </div>
      </div>

      {/* Receipt Key-Value Details */}
      <dl
        className={cn(
          "grid grid-cols-1 gap-x-6 gap-y-3.5 px-5 py-4 text-xs sm:grid-cols-2",
          compact && "py-3"
        )}
      >
        <div>
          <dt className="text-[11px] font-medium text-slate-500">
            {t("txnIdLabel", { method: mfsLabel })}
          </dt>
          <dd className="mt-0.5 flex items-center gap-1.5 font-mono text-sm font-semibold text-slate-900">
            <span>{txnId}</span>
            <button
              type="button"
              onClick={handleCopyTxn}
              aria-label={`Copy ${mfsLabel} transaction ID ${txnId}`}
              className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </dd>
        </div>

        <div>
          <dt className="text-[11px] font-medium text-slate-500">{t("disbursementTimeLabel")}</dt>
          <dd className="mt-0.5 font-medium text-slate-900">
            {formatDateTime(settledAt)} {t("bstTimezone")}
          </dd>
        </div>

        <div>
          <dt className="text-[11px] font-medium text-slate-500">{t("beneficiaryFarmerLabel")}</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">
            {translatePerson(claim.policy.farm.user.name)}
          </dd>
        </div>

        <div>
          <dt className="text-[11px] font-medium text-slate-500">{t("maskedWalletLabel")}</dt>
          <dd className="mt-0.5 font-medium text-slate-900">
            {mfsLabel} · <span className="font-mono">{maskedPhone}</span>
          </dd>
        </div>

        <div>
          <dt className="text-[11px] font-medium text-slate-500">{t("insuredFarmLabel")}</dt>
          <dd className="mt-0.5 font-medium text-slate-800">
            {translateFarmName(claim.policy.farm.name)} ({translateCrop(claim.policy.farm.cropType)})
          </dd>
        </div>

        <div>
          <dt className="text-[11px] font-medium text-slate-500">{t("weatherTriggerLabel")}</dt>
          <dd className="mt-0.5 text-slate-700">
            {translateMetricShort(claim.policy.metricType)}:{" "}
            <strong className="font-semibold text-slate-900">
              {formatNum(claim.triggerValue)} {unitLabel}
            </strong>{" "}
            (
            {t("thresholdInline", {
              val: formatNum(claim.policy.thresholdValue),
              unit: ` ${unitLabel}`,
            })}
            )
          </dd>
        </div>
      </dl>

      {/* Footer Verification Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5 font-mono">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
          {t("idempotencyLockLabel")} {claim.idempotencyKey}
        </span>

        {!compact && (
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Printer className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{t("printReceiptBtn")}</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function DisbursementReceiptModal({
  claim,
  onClose,
}: {
  claim: ReceiptClaimData | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  if (!claim) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("verifiedReceiptModalTitle")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div className="relative w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2.5 flex items-center justify-between text-white">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium">
            <Receipt className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("verifiedReceiptModalTitle")}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeMenuAria")}
            className="rounded-lg bg-white/15 p-1.5 text-white transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <DisbursementReceiptCard claim={claim} />
      </div>
    </div>
  );
}
