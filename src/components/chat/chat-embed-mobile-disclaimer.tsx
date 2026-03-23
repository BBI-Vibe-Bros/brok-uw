"use client";

import { useSearchParams } from "next/navigation";

/** When the chat is embedded (?embed=true), there is no in-page header with the disclaimer icon — show a compact strip on small screens only. */
export function ChatEmbedMobileDisclaimer() {
  const sp = useSearchParams();
  if (sp.get("embed") !== "true") return null;
  return (
    <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-[10px] leading-snug text-amber-900 md:hidden">
      Informational guidance only — confirm with the carrier before submitting.
    </div>
  );
}
