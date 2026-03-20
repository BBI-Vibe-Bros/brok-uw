"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_MEDSUPP_APPLICATION,
  DOCUMENT_TYPE_UW_GUIDE,
  ADMIN_DOCUMENT_TYPES,
  type AdminDocumentType,
} from "@/lib/documents/document-types";

/* ─── types ─── */

interface Carrier {
  id: string;
  name: string;
  slug: string;
  states_available: string[];
}

interface StaleRow {
  carrier_id: string;
  last_reference_date: string | null;
  months_since_update: number | null;
  status: "ok" | "warn" | "stale" | "unknown";
}

interface RuleRow {
  id: string;
  condition_name: string;
  decision: string;
  rule_summary: string;
}

/* ─── step enum ─── */

type Step = "carrier" | "upload" | "extracting" | "review" | "application_publish" | "done";

/* ─── badge helper ─── */

function freshnessBadge(s: StaleRow["status"]) {
  const cls: Record<string, string> = {
    ok: "bg-emerald-100 text-emerald-900",
    warn: "bg-amber-100 text-amber-900",
    stale: "bg-red-100 text-red-900",
    unknown: "bg-slate-100 text-slate-600",
  };
  return cls[s] ?? cls.unknown;
}

/* ─── custom dropdown ─── */

function CustomSelect({
  value,
  onChange,
  options,
  id,
}: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative" id={id}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex h-10 w-full items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm transition-colors hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
          open ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"
        }`}
      >
        <span className={selected ? "text-slate-900" : "text-slate-400"}>
          {selected?.label ?? "Select…"}
        </span>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {options.map((o) => {
            const isActive = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                    isActive
                      ? "border-blue-600 bg-blue-600"
                      : "border-slate-300"
                  }`}
                >
                  {isActive && (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── wizard ─── */

export function IngestionWizard() {
  const [step, setStep] = useState<Step>("carrier");

  /* shared */
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [staleById, setStaleById] = useState<Map<string, StaleRow>>(new Map());
  const [carrierId, setCarrierId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /* step: carrier */
  const [newCarrierName, setNewCarrierName] = useState("");
  const [newCarrierSlug, setNewCarrierSlug] = useState("");
  const [newCarrierStates, setNewCarrierStates] = useState("");
  const [creatingCarrier, setCreatingCarrier] = useState(false);
  const [showNewCarrier, setShowNewCarrier] = useState(false);

  /* step: upload */
  const [documentKind, setDocumentKind] = useState<AdminDocumentType>(DOCUMENT_TYPE_UW_GUIDE);
  const [file, setFile] = useState<File | null>(null);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);

  /* step: extracting */
  const [extractionMessage, setExtractionMessage] = useState<string | null>(null);

  /* step: review */
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [publishingApp, setPublishingApp] = useState(false);

  const selectedCarrier = useMemo(
    () => carriers.find((c) => c.id === carrierId) ?? null,
    [carriers, carrierId]
  );

  const docTypeOptions = ADMIN_DOCUMENT_TYPES.map((dt) => ({
    value: dt,
    label: DOCUMENT_TYPE_LABELS[dt],
  }));

  /* ─── load carriers + freshness ─── */

  const loadCarriers = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, sRes] = await Promise.all([
        fetch("/api/admin/carriers"),
        fetch("/api/admin/staleness"),
      ]);
      const cData = await cRes.json();
      const sData = await sRes.json();
      if (!cRes.ok) throw new Error(cData.error || "Carriers failed");
      setCarriers(cData.carriers ?? []);
      const m = new Map<string, StaleRow>();
      for (const row of (sData.carriers ?? []) as StaleRow[]) {
        m.set(row.carrier_id, row);
      }
      setStaleById(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCarriers();
  }, [loadCarriers]);

  /* ─── create carrier ─── */

  async function handleCreateCarrier(ev: FormEvent) {
    ev.preventDefault();
    setCreatingCarrier(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/carriers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCarrierName,
          slug: newCarrierSlug,
          states_available: newCarrierStates,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      setNewCarrierName("");
      setNewCarrierSlug("");
      setNewCarrierStates("");
      setShowNewCarrier(false);
      await loadCarriers();
      setCarrierId(data.carrier?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreatingCarrier(false);
    }
  }

  /* ─── upload ─── */

  async function handleUpload(ev: FormEvent) {
    ev.preventDefault();
    if (!file || !carrierId) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("carrier_id", carrierId);
      formData.set("document_type", documentKind);
      formData.set("effective_date", effectiveDate);
      formData.set("version", "1");
      formData.set("file", file);

      const res = await fetch("/api/admin/documents", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setDocumentId(data.document.id);
      if (documentKind === DOCUMENT_TYPE_MEDSUPP_APPLICATION) {
        setStep("application_publish");
      } else {
        setStep("extracting");
        void runExtraction(data.document.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  /* ─── extraction ─── */

  async function runExtraction(docId: string) {
    setError(null);
    setExtractionMessage("Running extraction — this may take a minute or two…");
    try {
      const res = await fetch("/api/admin/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: docId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      const d = data.diff_summary;
      const summary =
        d && typeof d === "object"
          ? `${data.extracted_rules} rules, ${data.extracted_drug_rules} drugs extracted. Diff vs verified: rules +${d.rules?.added ?? 0} ~${d.rules?.changed ?? 0} −${d.rules?.removed ?? 0}; drugs +${d.drugs?.added ?? 0} −${d.drugs?.removed ?? 0}.`
          : `${data.extracted_rules} rules, ${data.extracted_drug_rules} drugs extracted.`;
      setExtractionMessage(summary);
      void loadPending(docId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
      setExtractionMessage(null);
    }
  }

  /* ─── load pending rules for this document ─── */

  async function loadPending(docId: string) {
    try {
      const params = new URLSearchParams({
        status: "pending_review",
        document_id: docId,
        limit: "500",
      });
      const res = await fetch(`/api/admin/rules?${params}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Rules failed");
      setRules(j.rules ?? []);
      setSelected(new Set());
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed loading rules");
    }
  }

  /* ─── bulk approve / reject ─── */

  async function bulkAction(status: "verified" | "rejected") {
    if (!selected.size) return;
    setBusy(true);
    setReviewMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/rules/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], status }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setReviewMessage(`${status === "verified" ? "Approved" : "Rejected"} ${j.updated} rule(s).`);
      setSelected(new Set());
      if (documentId) void loadPending(documentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  /* ─── publish Med Supp application for chat downloads (no rule extract) ─── */

  async function handlePublishApplication() {
    if (!documentId) return;
    setPublishingApp(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/documents/${documentId}/publish-application`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Publish failed");
      setReviewMessage("Agents can ask the chat for this application (e.g. \u201Csend me the Med Supp application\u201D).");
      setStep("done");
      void loadCarriers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishingApp(false);
    }
  }

  /* ─── publish ─── */

  async function handlePublish() {
    if (!documentId) return;
    if (!window.confirm("Publish? Pending rules become verified and older rules for this carrier are superseded.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/documents/${documentId}/publish`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Publish failed");
      setReviewMessage(`Published! Superseded ${j.superseded_rules ?? 0} old rule(s).`);
      setStep("done");
      void loadCarriers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  /* ─── reset for another run ─── */

  function startOver() {
    setStep("carrier");
    setFile(null);
    setEffectiveDate("");
    setDocumentId(null);
    setExtractionMessage(null);
    setRules([]);
    setSelected(new Set());
    setReviewMessage(null);
    setError(null);
    setDocumentKind(DOCUMENT_TYPE_UW_GUIDE);
    void loadCarriers();
  }

  /* ─── step indicator ─── */

  const steps: { key: Step; label: string }[] = useMemo(() => {
    if (documentKind === DOCUMENT_TYPE_MEDSUPP_APPLICATION) {
      return [
        { key: "carrier", label: "Carrier" },
        { key: "upload", label: "Upload" },
        { key: "application_publish", label: "Publish" },
        { key: "done", label: "Done" },
      ];
    }
    return [
      { key: "carrier", label: "Carrier" },
      { key: "upload", label: "Upload" },
      { key: "extracting", label: "Extract" },
      { key: "review", label: "Review" },
      { key: "done", label: "Done" },
    ];
  }, [documentKind]);

  const stepIndex = Math.max(
    0,
    steps.findIndex((s) => s.key === step)
  );

  /* ═══════════════ render ═══════════════ */

  return (
    <div className="w-full min-w-0 space-y-6">
      {/* progress bar */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                i <= stepIndex
                  ? "bg-blue-600 text-white"
                  : "bg-slate-200 text-slate-500"
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`text-xs mr-2 ${
                i <= stepIndex ? "text-blue-700 font-medium" : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <div className="h-px w-6 bg-slate-300" />}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* ─── STEP 1: CARRIER ─── */}
      {step === "carrier" && (
        <Card>
          <CardContent className="pt-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Pick a Carrier</h2>
              <p className="text-sm text-muted-foreground">
                Select which carrier this document is for, or create one if it&apos;s new.
              </p>
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading carriers…</p>
            ) : carriers.length === 0 && !showNewCarrier ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">No carriers yet — create the first one.</p>
                <Button onClick={() => setShowNewCarrier(true)}>New Carrier</Button>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {carriers.map((c) => {
                      const st = staleById.get(c.id);
                      const isActive = carrierId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setCarrierId(c.id); setError(null); }}
                          className={`rounded-lg border p-3 text-left transition-colors ${
                            isActive
                              ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                              : "border-slate-200 hover:border-slate-400"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{c.name}</span>
                            {st && (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${freshnessBadge(st.status)}`}>
                                {st.status}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {st?.last_reference_date
                              ? `Last Guide: ${st.last_reference_date} (${st.months_since_update ?? "?"} mo)`
                              : "No Guide Processed Yet"}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {!showNewCarrier && (
                    <button
                      type="button"
                      onClick={() => setShowNewCarrier(true)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      + Add New Carrier
                    </button>
                  )}
                </div>

                {showNewCarrier && (
                  <form onSubmit={handleCreateCarrier} className="space-y-3 rounded-lg border bg-slate-50 p-4">
                    <p className="text-sm font-medium">New Carrier</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Name</Label>
                        <Input value={newCarrierName} onChange={(e) => setNewCarrierName(e.target.value)} placeholder="Aetna" required />
                      </div>
                      <div className="space-y-1">
                        <Label>Slug (Optional)</Label>
                        <Input value={newCarrierSlug} onChange={(e) => setNewCarrierSlug(e.target.value)} placeholder="aetna" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>States (Comma-Separated, Optional)</Label>
                      <Input value={newCarrierStates} onChange={(e) => setNewCarrierStates(e.target.value)} placeholder="TX, OK, FL" />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" disabled={creatingCarrier} size="sm">
                        {creatingCarrier ? "Creating…" : "Create"}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewCarrier(false)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}

                <div className="space-y-2 max-w-md pt-2">
                  <Label>Document Type</Label>
                  <CustomSelect
                    value={documentKind}
                    onChange={(val) => setDocumentKind(val as AdminDocumentType)}
                    options={docTypeOptions}
                  />
                  <p className="text-xs text-muted-foreground">
                    Guides go through rule extraction. Applications are stored for agents to download from chat (no UW
                    parsing).
                  </p>
                </div>

                <div className="pt-2">
                  <Button disabled={!carrierId} onClick={() => { setError(null); setStep("upload"); }}>
                    Continue With {selectedCarrier?.name ?? "Carrier"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── STEP 2: UPLOAD ─── */}
      {step === "upload" && (
        <Card>
          <CardContent className="pt-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">
                Upload {documentKind === DOCUMENT_TYPE_MEDSUPP_APPLICATION ? "Application" : "Guide"} for{" "}
                {selectedCarrier?.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                {documentKind === DOCUMENT_TYPE_MEDSUPP_APPLICATION
                  ? "PDF, Word, or DOCX. After upload you'll publish it so chat can offer a download link."
                  : "PDF (or Word). We'll extract rules in the next step."}
              </p>
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file">File</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  required
                />
              </div>
              <div className="max-w-xs space-y-2">
                <Label htmlFor="effective_date">Effective Date (Optional)</Label>
                <Input
                  id="effective_date"
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={!file || uploading}>
                  {uploading ? "Uploading…" : documentKind === DOCUMENT_TYPE_MEDSUPP_APPLICATION ? "Upload" : "Upload & Extract"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setStep("carrier")}>
                  Back
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ─── APPLICATION: publish for chat ─── */}
      {step === "application_publish" && (
        <Card>
          <CardContent className="pt-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold mb-1">Application Uploaded</h2>
              <p className="text-sm text-muted-foreground">
                {file?.name ? (
                  <>
                    <span className="font-medium text-foreground">{file.name}</span> is in storage. Publish so agents can
                    ask the chat for this carrier&apos;s Med Supp application (signed download link).
                  </>
                ) : (
                  "File is in storage. Publish to enable chat downloads."
                )}
              </p>
            </div>
            {reviewMessage && <p className="text-sm text-emerald-700">{reviewMessage}</p>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handlePublishApplication()} disabled={publishingApp}>
                {publishingApp ? "Publishing…" : "Make Available in Chat"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setStep("upload")}>
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── STEP 3: EXTRACTING ─── */}
      {step === "extracting" && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="text-lg font-semibold">Extracting Rules…</h2>
            {extractionMessage && (
              <p className="text-sm text-muted-foreground">{extractionMessage}</p>
            )}
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full animate-pulse rounded-full bg-blue-400 w-3/4" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── STEP 4: REVIEW ─── */}
      {step === "review" && (
        <Card>
          <CardContent className="pt-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold mb-1">Review Extracted Rules</h2>
              {extractionMessage && (
                <p className="text-sm text-muted-foreground">{extractionMessage}</p>
              )}
            </div>

            {reviewMessage && <p className="text-sm text-emerald-700">{reviewMessage}</p>}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy || !selected.size} onClick={() => void bulkAction("verified")}>
                Approve Selected
              </Button>
              <Button size="sm" variant="destructive" disabled={busy || !selected.size} onClick={() => void bulkAction("rejected")}>
                Reject Selected
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void handlePublish()} disabled={busy}>
                Approve All & Publish
              </Button>
              <span className="self-center text-xs text-muted-foreground">{selected.size} selected of {rules.length}</span>
            </div>

            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No pending rules — everything may have been approved already.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border max-h-[60vh]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="border-b text-left">
                      <th className="w-10 px-2 py-2">
                        <input
                          type="checkbox"
                          aria-label="Select all"
                          checked={selected.size === rules.length && rules.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) setSelected(new Set(rules.map((r) => r.id)));
                            else setSelected(new Set());
                          }}
                        />
                      </th>
                      <th className="px-2 py-2">Condition</th>
                      <th className="px-2 py-2">Decision</th>
                      <th className="px-2 py-2">Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.id} className="border-b align-top">
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(r.id)) next.delete(r.id);
                                else next.add(r.id);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2 min-w-[120px]">{r.condition_name}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{r.decision}</td>
                        <td className="px-2 py-2 text-muted-foreground">{r.rule_summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={startOver}>
                Start Over
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── STEP 5: DONE ─── */}
      {step === "done" && (
        <Card>
          <CardContent className="pt-6 space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold">
              {documentKind === DOCUMENT_TYPE_MEDSUPP_APPLICATION ? "Application Live" : "Guide Published"}
            </h2>
            {reviewMessage && <p className="text-sm text-muted-foreground">{reviewMessage}</p>}
            <Button onClick={startOver}>
              {documentKind === DOCUMENT_TYPE_MEDSUPP_APPLICATION ? "Add Another Document" : "Ingest Another Guide"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
