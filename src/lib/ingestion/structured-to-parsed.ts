import type { StructuredUwExtraction } from "@/lib/marker/types";
import { normalizeExtractedRule } from "@/lib/ai/rule-normalizer";
import type { ParsedDrugRecord, ParsedRuleRecord } from "@/lib/ingestion/extract-document";

function ruleKey(r: { condition_name: string; rule_type: string }) {
  return `${r.rule_type}::${r.condition_name.toLowerCase().trim()}`;
}

function drugKey(d: { drug_name: string }) {
  return d.drug_name.toLowerCase().trim();
}

export function structuredToParsedRules(structured: StructuredUwExtraction | null | undefined): ParsedRuleRecord[] {
  if (!structured) return [];
  const out: ParsedRuleRecord[] = [];

  for (const k of structured.knockout_conditions ?? []) {
    const name = (k.condition_name ?? "").trim();
    if (!name) continue;
    const summaryParts = [name];
    if (k.additional_criteria) summaryParts.push(k.additional_criteria);
    if (k.section_reference) summaryParts.push(`(${k.section_reference})`);
    const normalized = normalizeExtractedRule({
      condition_name: name,
      decision: k.is_absolute === false ? "conditional" : "decline",
      rule_summary: summaryParts.join(" — ").slice(0, 240),
      rule_detail: k.additional_criteria ?? null,
      confidence_score: 0.82,
    });
    out.push({
      rule_type: k.is_absolute === false ? "conditional" : "knockout",
      category: "structured_extract",
      condition_name: normalized.condition_name,
      decision: normalized.decision,
      rule_summary: normalized.rule_summary,
      rule_detail: normalized.rule_detail ?? null,
      confidence_score: normalized.confidence_score ?? 0.82,
    });
  }

  for (const p of structured.process_rules ?? []) {
    const text = (p.rule_text ?? "").trim();
    if (!text) continue;
    const head = (p.rule_type ?? "process").replace(/_/g, " ");
    const normalized = normalizeExtractedRule({
      condition_name: head.slice(0, 80),
      decision: "review_required",
      rule_summary: text.slice(0, 240),
      rule_detail: p.applicable_states?.length
        ? `States: ${p.applicable_states.join(", ")}`
        : null,
      confidence_score: 0.7,
    });
    out.push({
      rule_type: "process",
      category: p.rule_type ?? "process",
      condition_name: normalized.condition_name,
      decision: "conditional",
      rule_summary: normalized.rule_summary,
      rule_detail: normalized.rule_detail ?? null,
      confidence_score: normalized.confidence_score ?? 0.7,
    });
  }

  return out;
}

export function structuredToParsedDrugs(structured: StructuredUwExtraction | null | undefined): ParsedDrugRecord[] {
  if (!structured) return [];
  const out: ParsedDrugRecord[] = [];
  for (const d of structured.drug_declines ?? []) {
    const drug = (d.drug_name ?? "").trim();
    const cond = (d.condition_trigger ?? "").trim();
    if (!drug || !cond) continue;
    out.push({
      drug_name: drug,
      condition_trigger: cond,
      decision: d.is_conditional ? "conditional" : "decline",
      notes: "Source: Datalab structured extract",
    });
  }
  return out;
}

/** Merge heuristic + structured lists; structured wins on duplicate keys. */
export function mergeParsedRules(
  heuristic: ParsedRuleRecord[],
  structured: ParsedRuleRecord[]
): ParsedRuleRecord[] {
  const map = new Map<string, ParsedRuleRecord>();
  for (const r of heuristic) {
    map.set(ruleKey({ condition_name: r.condition_name, rule_type: r.rule_type }), r);
  }
  for (const r of structured) {
    map.set(ruleKey({ condition_name: r.condition_name, rule_type: r.rule_type }), r);
  }
  return [...map.values()];
}

export function mergeParsedDrugs(heuristic: ParsedDrugRecord[], structured: ParsedDrugRecord[]): ParsedDrugRecord[] {
  const map = new Map<string, ParsedDrugRecord>();
  for (const d of heuristic) {
    map.set(drugKey(d), d);
  }
  for (const d of structured) {
    map.set(drugKey(d), d);
  }
  return [...map.values()];
}
