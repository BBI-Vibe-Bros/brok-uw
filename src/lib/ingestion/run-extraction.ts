import { extractWithMarker } from "@/lib/marker/client";
import { DOCUMENT_TYPE_MEDSUPP_APPLICATION } from "@/lib/documents/document-types";
import { parseDrugRulesFromMarkdown, parseRulesFromMarkdown } from "@/lib/ingestion/extract-document";
import {
  mergeParsedDrugs,
  mergeParsedRules,
  structuredToParsedDrugs,
  structuredToParsedRules,
} from "@/lib/ingestion/structured-to-parsed";
import { diffDrugsAgainstVerified, diffRulesAgainstVerified } from "@/lib/ingestion/diff-rules";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_BUCKET = "uw-documents";

function inferContentType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "application/octet-stream";
}

export interface RunExtractionResult {
  extracted_rules: number;
  extracted_drug_rules: number;
  marker_json: Record<string, unknown>;
}

export async function runExtractionForDocument(
  supabase: SupabaseClient,
  documentId: string,
  options?: { bucket?: string }
): Promise<RunExtractionResult> {
  const bucket = options?.bucket || process.env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET;

  const { data: document, error: documentError } = await supabase
    .from("source_documents")
    .select("id, carrier_id, filename, storage_path, version, document_type")
    .eq("id", documentId)
    .single();

  if (documentError || !document) {
    throw new Error("Document not found");
  }

  if (document.document_type === DOCUMENT_TYPE_MEDSUPP_APPLICATION) {
    throw new Error(
      "Med Supp applications are not rule-extracted. In admin, use “Make available in chat” instead."
    );
  }

  await supabase.from("source_documents").update({ status: "processing" }).eq("id", documentId);

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from(bucket)
    .download(document.storage_path);

  if (downloadError || !fileBlob) {
    throw new Error(downloadError?.message || "Could not download source document");
  }

  const arrayBuffer = await fileBlob.arrayBuffer();
  const marker = await extractWithMarker({
    fileName: document.filename,
    mimeType: inferContentType(document.filename),
    fileBuffer: Buffer.from(arrayBuffer),
  });

  const fromStructuredRules = structuredToParsedRules(marker.structured);
  const fromStructuredDrugs = structuredToParsedDrugs(marker.structured);
  const heuristicRules = parseRulesFromMarkdown(marker.markdown);
  const heuristicDrugs = parseDrugRulesFromMarkdown(marker.markdown);

  const extractedRules = mergeParsedRules(heuristicRules, fromStructuredRules);
  const extractedDrugRules = mergeParsedDrugs(heuristicDrugs, fromStructuredDrugs);

  const { data: verifiedRules } = await supabase
    .from("rules")
    .select("id, condition_name, rule_type, rule_summary, decision, source_document_id")
    .eq("carrier_id", document.carrier_id)
    .eq("status", "verified");

  const { data: verifiedDrugs } = await supabase
    .from("drug_rules")
    .select("id, drug_name, condition_trigger, decision, source_document_id")
    .eq("carrier_id", document.carrier_id)
    .eq("status", "verified");

  const rulesDiff = diffRulesAgainstVerified(
    extractedRules,
    (verifiedRules ?? []).map((r) => ({
      id: r.id,
      condition_name: r.condition_name,
      rule_type: r.rule_type,
      rule_summary: r.rule_summary,
      decision: r.decision,
      source_document_id: r.source_document_id,
    }))
  );

  const drugsDiff = diffDrugsAgainstVerified(
    extractedDrugRules,
    (verifiedDrugs ?? []).map((d) => ({
      id: d.id,
      drug_name: d.drug_name,
      condition_trigger: d.condition_trigger,
      decision: d.decision,
      source_document_id: d.source_document_id,
    }))
  );

  await supabase
    .from("rules")
    .delete()
    .eq("source_document_id", document.id)
    .eq("status", "pending_review");
  await supabase
    .from("drug_rules")
    .delete()
    .eq("source_document_id", document.id)
    .eq("status", "pending_review");

  if (extractedRules.length > 0) {
    const { error: rulesInsertError } = await supabase.from("rules").insert(
      extractedRules.map((rule) => ({
        carrier_id: document.carrier_id,
        source_document_id: document.id,
        rule_type: rule.rule_type,
        category: rule.category,
        subcategory: null,
        condition_name: rule.condition_name,
        decision: rule.decision,
        rule_summary: rule.rule_summary,
        rule_detail: rule.rule_detail,
        structured_data: {
          source: "datalab+heuristic-v2",
          has_structured: Boolean(marker.structured && fromStructuredRules.length > 0),
        },
        applicable_states: [],
        lookback_months: null,
        confidence_score: rule.confidence_score,
        source_section: null,
        source_page: null,
        citation_block_ids: null,
        version: document.version,
        status: "pending_review",
        verified_by: null,
        verified_at: null,
      }))
    );
    if (rulesInsertError) throw new Error(rulesInsertError.message);
  }

  if (extractedDrugRules.length > 0) {
    const { error: drugsInsertError } = await supabase.from("drug_rules").insert(
      extractedDrugRules.map((rule) => ({
        carrier_id: document.carrier_id,
        source_document_id: document.id,
        drug_name: rule.drug_name,
        generic_name: null,
        brand_name: null,
        condition_trigger: rule.condition_trigger,
        is_conditional: rule.decision === "conditional",
        decision: rule.decision,
        notes: rule.notes,
        version: document.version,
        status: "pending_review",
      }))
    );
    if (drugsInsertError) throw new Error(drugsInsertError.message);
  }

  const markerJson = {
    source: "datalab_pipeline",
    extracted_rule_count: extractedRules.length,
    extracted_drug_count: extractedDrugRules.length,
    extraction_schema_version: "phase2-v2",
    structured_knockout_count: marker.structured?.knockout_conditions?.length ?? 0,
    structured_drug_count: marker.structured?.drug_declines?.length ?? 0,
    rules_diff: rulesDiff,
    drugs_diff: drugsDiff,
    marker_raw: marker.raw,
  };

  const { error: finalizeError } = await supabase
    .from("source_documents")
    .update({
      status: "processed",
      extracted_markdown: marker.markdown,
      marker_checkpoint_id: marker.checkpointId,
      marker_json: markerJson,
    })
    .eq("id", document.id);

  if (finalizeError) throw new Error(finalizeError.message);

  return {
    extracted_rules: extractedRules.length,
    extracted_drug_rules: extractedDrugRules.length,
    marker_json: markerJson,
  };
}

export async function markExtractionFailed(
  supabase: SupabaseClient,
  documentId: string,
  message: string
) {
  await supabase
    .from("source_documents")
    .update({
      status: "failed",
      marker_json: {
        source: "datalab_pipeline",
        error: message,
        failed_at: new Date().toISOString(),
      },
    })
    .eq("id", documentId);
}
