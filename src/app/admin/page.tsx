"use client";

import { useState } from "react";
import { IngestionWizard } from "@/components/admin/ingestion-wizard";
import { CarrierDirectory } from "@/components/admin/carrier-directory";

type Tab = "ingest" | "directory";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("directory");

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {tab === "directory" ? "Carrier Directory" : "Ingest Underwriting Guides"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tab === "directory"
              ? "All carriers at a glance — guide dates, rule counts, freshness."
              : "Pick a carrier, upload the PDF, review extracted rules, publish."}
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        <button
          type="button"
          onClick={() => setTab("directory")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "directory"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Directory
        </button>
        <button
          type="button"
          onClick={() => setTab("ingest")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "ingest"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Ingest
        </button>
      </div>

      {tab === "directory" && <CarrierDirectory />}
      {tab === "ingest" && <IngestionWizard />}
    </div>
  );
}
