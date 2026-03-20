"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { CarrierResult } from "@/types/chat-results";
import { ChevronDown, ChevronUp } from "lucide-react";

const verdictColor: Record<CarrierResult["verdict"], string> = {
  decline: "text-red-700 bg-red-50",
  conditional: "text-amber-700 bg-amber-50",
  likely_approve: "text-emerald-700 bg-emerald-50",
  unknown: "text-gray-500 bg-gray-50",
};

const verdictLabel: Record<CarrierResult["verdict"], string> = {
  decline: "Decline",
  conditional: "Conditional",
  likely_approve: "Likely OK",
  unknown: "Unknown",
};

export function CarrierComparison({ results }: { results: CarrierResult[] }) {
  const [open, setOpen] = useState(true);

  if (results.length < 2) return null;

  return (
    <div className="rounded-lg border bg-white text-left">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
      >
        <span>Compare {results.length} carriers side-by-side</span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="overflow-x-auto border-t">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap min-w-[100px]">
                  Carrier
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">Verdict</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">Conf.</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 min-w-[200px]">Key Issue</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">Source</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const topIssue =
                  r.knockout_conditions[0] ||
                  r.conditional_notes[0] ||
                  r.reasons[0] ||
                  "—";
                const src = r.citation
                  ? `${r.citation.document}${r.citation.page ? ` p.${r.citation.page}` : ""}`
                  : "—";
                return (
                  <tr key={r.carrier_id} className="border-b last:border-b-0">
                    <td className="sticky left-0 z-10 bg-white border-r border-slate-100 px-3 py-2 font-medium whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.04)]">
                      {r.carrier_name}
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn("inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold", verdictColor[r.verdict])}>
                        {verdictLabel[r.verdict]}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-gray-500">
                      {Math.round(r.confidence * 100)}%
                    </td>
                    <td className="px-3 py-2 text-gray-600 max-w-[280px]">
                      <span className="line-clamp-2">{topIssue}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{src}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
