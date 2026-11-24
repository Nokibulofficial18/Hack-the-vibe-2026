"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, ShieldCheck, Sprout, UserCheck } from "lucide-react";
import { useAuth, type UserRole } from "@/lib/auth";
import { useToast } from "@/components/ToastProvider";
import { cn } from "@/lib/utils";

export function RoleSwitcher() {
  const { user, users, isAdmin, switchRole, switchUser, getAuthHeaders } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [resetting, setResetting] = useState(false);

  const handleRoleSwitch = (role: UserRole) => {
    if (role === user.role) return;
    switchRole(role);
    toast({
      variant: "info",
      title: `Switched to ${role === "ADMIN" ? "Admin" : "Farmer"} View`,
      description:
        role === "ADMIN"
          ? "Global risk controls, A06 fault injector, and A07 workflow runner enabled."
          : "Scoped strictly to the active farmer's plots, policies, and payouts.",
    });
    router.refresh();
  };

  const handleUserSwitch = (userId: string) => {
    const target = users.find((u) => u.id === userId);
    switchUser(userId);
    if (target) {
      toast({
        variant: "info",
        title: `Active Account: ${target.name}`,
        description: `${target.role} · ${target.email}`,
      });
    }
    router.refresh();
  };

  const handleDemoReset = async () => {
    const confirmed = window.confirm(
      "Reset demo database back to the clean seeded state (1 Admin, 2 Farmers, 3 Farms, 4 Active Policies)?"
    );
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
          title: "Demo Reset Failed",
          description: data.error ?? "Unable to reset seeded data.",
        });
        return;
      }
      toast({
        variant: "success",
        title: "Demo Data Reset Complete",
        description: data.message ?? "Restored 3 farms, 4 active policies, and baseline balances.",
      });
      router.refresh();
      // Force reload so client-fetched tables also immediately reflect the reset state
      window.location.reload();
    } catch {
      toast({
        variant: "error",
        title: "Network Error",
        description: "Could not reach /api/demo/reset.",
      });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label="Mock Role and Persona Switcher"
    >
      {/* Fast Farmer / Admin Toggle */}
      <div
        role="group"
        aria-label="Quick Role Switch"
        className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-1"
      >
        <button
          type="button"
          onClick={() => handleRoleSwitch("FARMER")}
          aria-pressed={user.role === "FARMER"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600",
            user.role === "FARMER"
              ? "bg-emerald-700 text-white shadow-sm"
              : "text-slate-700 hover:text-slate-950"
          )}
        >
          <Sprout className="h-3.5 w-3.5" aria-hidden="true" />
          Farmer
        </button>
        <button
          type="button"
          onClick={() => handleRoleSwitch("ADMIN")}
          aria-pressed={user.role === "ADMIN"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600",
            user.role === "ADMIN"
              ? "bg-indigo-700 text-white shadow-sm"
              : "text-slate-700 hover:text-slate-950"
          )}
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Admin
        </button>
      </div>

      {/* Persona Selector */}
      <div className="relative flex items-center">
        <UserCheck
          className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-500"
          aria-hidden="true"
        />
        <label htmlFor="persona-select" className="sr-only">
          Active Demo Account
        </label>
        <select
          id="persona-select"
          value={user.id}
          onChange={(e) => handleUserSwitch(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-7 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/25"
        >
          {users.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} ({account.role})
            </option>
          ))}
        </select>
      </div>

      {/* Admin Demo Reset Button */}
      {isAdmin && (
        <button
          type="button"
          onClick={handleDemoReset}
          disabled={resetting}
          aria-label="Reset demo database to initial seed state"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 disabled:opacity-50"
        >
          <RotateCcw
            className={cn("h-3.5 w-3.5", resetting && "animate-spin")}
            aria-hidden="true"
          />
          {resetting ? "Resetting..." : "Demo Reset"}
        </button>
      )}
    </div>
  );
}
