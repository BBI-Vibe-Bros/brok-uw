"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Shield, User, ChevronDown, ChevronUp } from "lucide-react";
import type { CarrierResult } from "@/types/chat-results";
import { ChatMarkdown } from "./chat-markdown";
import { CarrierComparison } from "./carrier-comparison";

export type { CarrierResult } from "@/types/chat-results";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  results?: CarrierResult[] | null;
  timestamp?: string;
}

function VerdictBadge({ verdict }: { verdict: CarrierResult["verdict"] }) {
  const styles = {
    decline: "bg-red-100 text-red-800 border-red-200",
    conditional: "bg-amber-100 text-amber-800 border-amber-200",
    likely_approve: "bg-emerald-100 text-emerald-800 border-emerald-200",
    unknown: "bg-gray-100 text-gray-600 border-gray-200",
  };
  const labels = {
    decline: "DECLINE",
    conditional: "CONDITIONAL",
    likely_approve: "LIKELY APPROVE",
    unknown: "UNKNOWN",
  };
  return (
    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded border", styles[verdict])}>
      {labels[verdict]}
    </span>
  );
}

function CarrierResultCard({ result }: { result: CarrierResult }) {
  return (
    <div className="border rounded-lg p-3 bg-white space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">{result.carrier_name}</span>
        <VerdictBadge verdict={result.verdict} />
      </div>

      {result.knockout_conditions.length > 0 && (
        <div className="space-y-1">
          {result.knockout_conditions.map((k, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-red-700">
              <span className="shrink-0 mt-0.5">🚫</span>
              <span>{k}</span>
            </div>
          ))}
        </div>
      )}

      {result.conditional_notes.length > 0 && (
        <div className="space-y-1">
          {result.conditional_notes.map((n, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-amber-700">
              <span className="shrink-0 mt-0.5">⚠️</span>
              <span>{n}</span>
            </div>
          ))}
        </div>
      )}

      {result.reasons.length > 0 && (
        <div className="space-y-1">
          {result.reasons.map((r, i) => (
            <div key={i} className="text-xs text-gray-600">• {r}</div>
          ))}
        </div>
      )}

      {result.follow_up_questions.length > 0 && (
        <div className="border-t pt-2 mt-2">
          <div className="text-xs font-medium text-gray-500 mb-1">Ask the client:</div>
          {result.follow_up_questions.map((q, i) => (
            <div key={i} className="text-xs text-blue-700">→ {q}</div>
          ))}
        </div>
      )}

      {result.citation && (
        <div className="text-[10px] text-gray-400 border-t pt-1 mt-1">
          Source: {result.citation.document}
          {result.citation.page && `, p.${result.citation.page}`}
          {result.citation.section && ` (${result.citation.section})`}
          {result.citation.effective_date && ` • Eff: ${result.citation.effective_date}`}
          {result.confidence > 0 && ` • Confidence: ${Math.round(result.confidence * 100)}%`}
        </div>
      )}
    </div>
  );
}

function CarrierDetailCards({ results }: { results: CarrierResult[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
      >
        <span>Per-carrier details ({results.length})</span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="space-y-2 border-t px-2 py-2">
          {results.map((result, i) => (
            <CarrierResultCard key={i} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3 max-w-3xl", isUser ? "ml-auto flex-row-reverse" : "mr-auto")}>
      <div
        className={cn(
          "shrink-0 h-8 w-8 rounded-full flex items-center justify-center",
          isUser ? "bg-blue-100" : "bg-gray-100"
        )}
      >
        {isUser ? <User className="h-4 w-4 text-blue-600" /> : <Shield className="h-4 w-4 text-gray-600" />}
      </div>
      <div className={cn("space-y-2 max-w-[85%]", isUser ? "text-right" : "text-left")}>
        <div
          className={cn(
            "inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-blue-600 text-white rounded-br-md"
              : "bg-gray-100 text-gray-900 rounded-bl-md"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-left">{message.content}</p>
          ) : (
            <ChatMarkdown content={message.content} />
          )}
        </div>

        {message.results && message.results.length > 0 && (
          <div className="space-y-2 text-left">
            <CarrierComparison results={message.results} />
            <CarrierDetailCards results={message.results} />
            <div className="text-[10px] text-gray-400 italic px-1">
              Carriers make the final call — double-check before you submit.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
