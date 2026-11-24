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
import { useToast } from "@/components/ToastProvider";
import {
  getMetricMeta,
  getPayoutMethodMeta,
  maskBdMobileNumber,
} from "@/lib/domain";
import { cn, formatCurrency } from "@/lib/utils";

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
  const { toast } = useToast();
  const method = claim.payoutMethod ?? claim.policy.farm.user.payoutMethod ?? "BKASH";
  const mfs = getPayoutMethodMeta(method);
  const metric = getMetricMeta(claim.policy.metricType);
  const rawPhone = claim.recipientPhone ?? claim.policy.farm.user.mobileNumber ?? "+8801711000000";
  const maskedPhone = maskBdMobileNumber(rawPhone);
  const txnId = claim.transactionId ?? `SIM-${claim.id.slice(0, 10).toUpperCase()}`;
  const settledAt = claim.disbursedAt ?? claim.createdAt;
  const tierLabel =
    claim.severityTier === "SEVERE"
      ? `SEVERE BREACH (${claim.payoutPercentage ?? 100}%)`
      : claim.severityTier === "MODERATE"
        ? `MODERATE BREACH (${claim.payoutPercentage ?? 50}%)`
        : "PARAMETRIC SETTLEMENT";

  const handleCopyTxn = async () => {
    try {
      await navigator.clipboard.writeText(txnId);
      toast({
        variant: "success",
        title: "Transaction ID Copied",
        description: `${mfs.label} Ref: ${txnId}`,
      });
    } catch {
      toast({
        variant: "info",
        title: "Transaction Reference",
        description: txnId,
      });
    }
  };

  return (
    <div
      aria-label="Digital MFS Disbursement Receipt"
      className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-md"
    >
      {/* Branded MFS Header */}
      <div className={cn("px-5 py-4", mfs.headerBgClass)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
              <Smartphone className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/90">
                {mfs.tagline}
              </p>
              <h3 className="text-base font-extrabold text-white">
                {mfs.label} Digital Payout Receipt
              </h3>
            </div>
          </div>

          <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold text-white backdrop-blur">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            DISBURSED
          </span>
        </div>
      </div>

      {/* Amount & Tier Banner */}
      <div className="border-b border-dashed border-slate-300 bg-slate-50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
              Amount Credited (BDT)
            </p>
            <p className="mt-0.5 text-3xl font-extrabold tracking-tight text-emerald-800">
              {formatCurrency(claim.payoutAmount)}
            </p>
          </div>
          <div className="text-right">
            <span
              className={cn(
                "inline-block rounded-full px-2.5 py-1 text-[11px] font-extrabold",
                claim.severityTier === "SEVERE"
                  ? "bg-rose-100 text-rose-900 ring-1 ring-rose-300"
                  : "bg-amber-100 text-amber-950 ring-1 ring-amber-300"
              )}
            >
              {tierLabel}
            </span>
            <p className="mt-1 text-[11px] font-medium text-slate-600">
              of {formatCurrency(claim.policy.coverageAmount)} policy coverage
            </p>
          </div>
        </div>
      </div>

      {/* Receipt Key-Value Details */}
      <dl
        className={cn(
          "grid grid-cols-1 gap-x-6 gap-y-3 px-5 py-4 text-xs sm:grid-cols-2",
          compact && "py-3"
        )}
      >
        <div>
          <dt className="font-semibold text-slate-500">{mfs.label} Transaction ID</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 font-mono text-sm font-bold text-slate-950">
            <span>{txnId}</span>
            <button
              type="button"
              onClick={handleCopyTxn}
              aria-label={`Copy ${mfs.label} transaction ID ${txnId}`}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </dd>
        </div>

        <div>
          <dt className="font-semibold text-slate-500">Disbursement Timestamp</dt>
          <dd className="mt-0.5 font-mono font-semibold text-slate-900">
            {new Date(settledAt).toLocaleString("en-GB", {
              timeZone: "Asia/Dhaka",
              dateStyle: "medium",
              timeStyle: "medium",
            })}{" "}
            BST
          </dd>
        </div>

        <div>
          <dt className="font-semibold text-slate-500">Beneficiary Farmer</dt>
          <dd className="mt-0.5 font-bold text-slate-900">{claim.policy.farm.user.name}</dd>
        </div>

        <div>
          <dt className="font-semibold text-slate-500">Masked Mobile Wallet</dt>
          <dd className="mt-0.5 font-mono font-bold text-slate-900">
            {mfs.label} · {maskedPhone}
          </dd>
        </div>

        <div>
          <dt className="font-semibold text-slate-500">Insured Farm Plot</dt>
          <dd className="mt-0.5 font-semibold text-slate-800">
            {claim.policy.farm.name} ({claim.policy.farm.cropType})
          </dd>
        </div>

        <div>
          <dt className="font-semibold text-slate-500">Parametric Weather Trigger</dt>
          <dd className="mt-0.5 font-semibold text-slate-800">
            {claim.policy.metricType}:{" "}
            <strong className="text-slate-950">
              {claim.triggerValue}
              {metric.unit}
            </strong>{" "}
            (threshold {claim.policy.thresholdValue}
            {metric.unit})
          </dd>
        </div>
      </dl>

      {/* Footer Verification Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1.5 font-mono">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
          Idempotency Lock: {claim.idempotencyKey}
        </span>

        {!compact && (
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-100"
          >
            <Printer className="h-3 w-3" aria-hidden="true" />
            Print Receipt
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
  if (!claim) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Digital Payout Receipt Dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between text-white">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold">
            <Receipt className="h-4 w-4" aria-hidden="true" />
            Verified WeatherShield Settlement Receipt
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt modal"
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
