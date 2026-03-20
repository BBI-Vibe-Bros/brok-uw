"use client";

import { Shield, Lock, Phone, Mail, LogOut } from "lucide-react";

interface PaywallGateProps {
  agentName?: string | null;
}

export function PaywallGate({ agentName }: PaywallGateProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-white p-6">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 shadow-lg">
          <Shield className="h-8 w-8 text-white" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {agentName ? `Hey ${agentName.split(" ")[0]}` : "Welcome to BrokUW"}
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            BrokUW gives agents instant AI-powered Medicare Supplement
            underwriting guidance — conditions, medications, carrier comparisons, all
            in one chat.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-sm text-slate-700 text-left">
              Full access is available to <strong>Brock Partners</strong>{" "}
              agents at no cost. If you&apos;re not with Brock, contact us to
              get set up with a subscription.
            </p>
          </div>

          <hr className="border-slate-100" />

          <div className="space-y-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              What you get
            </p>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                Instant underwriting checks across 30+ carriers
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                Condition + medication lookups with knockout flags
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                Side-by-side carrier comparisons
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                Med Supp application downloads
              </li>
            </ul>
          </div>
        </div>

        <div className="space-y-3">
          <a
            href="mailto:info@brockpartners.com"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <Mail className="h-4 w-4" />
            Request Access
          </a>
          <a
            href="tel:+16628443300"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <Phone className="h-4 w-4" />
            Call Us
          </a>
        </div>

        <form action="/api/auth/signout" method="POST" className="pt-2">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            <LogOut className="h-3 w-3" />
            Sign out and use a different account
          </button>
        </form>
      </div>
    </div>
  );
}
