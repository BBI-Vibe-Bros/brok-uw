import type { ParsedDrugRecord, ParsedRuleRecord } from "@/lib/ingestion/extract-document";

export interface VerifiedRuleSnapshot {
  id: string;
  condition_name: string;
  rule_type: string;
  rule_summary: string;
  decision: string;
  source_document_id: string | null;
}

export interface VerifiedDrugSnapshot {
  id: string;
  drug_name: string;
  condition_trigger: string;
  decision: string;
  source_document_id: string | null;
}

export interface RuleDiffSummary {
  added: Array<{ condition_name: string; rule_type: string; rule_summary: string }>;
  changed: Array<{
    previous_rule_id: string;
    condition_name: string;
    rule_type: string;
    previous_summary: string;
    new_summary: string;
  }>;
  removed: Array<{
    rule_id: string;
    condition_name: string;
    rule_type: string;
    rule_summary: string;
  }>;
}

export interface DrugDiffSummary {
  added: Array<{ drug_name: string; condition_trigger: string }>;
  removed: Array<{ drug_rule_id: string; drug_name: string; condition_trigger: string }>;
}

function normCondition(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchKeyRule(r: { condition_name: string; rule_type: string }) {
  return `${r.rule_type}::${normCondition(r.condition_name)}`;
}

export function diffRulesAgainstVerified(
  newRules: ParsedRuleRecord[],
  verified: VerifiedRuleSnapshot[]
): RuleDiffSummary {
  const newByKey = new Map<string, ParsedRuleRecord>();
  for (const r of newRules) {
    newByKey.set(matchKeyRule(r), r);
  }
  const oldByKey = new Map<string, VerifiedRuleSnapshot>();
  for (const r of verified) {
    oldByKey.set(matchKeyRule(r), r);
  }

  const added: RuleDiffSummary["added"] = [];
  const changed: RuleDiffSummary["changed"] = [];
  const removed: RuleDiffSummary["removed"] = [];

  for (const [key, r] of newByKey) {
    const prev = oldByKey.get(key);
    if (!prev) {
      added.push({
        condition_name: r.condition_name,
        rule_type: r.rule_type,
        rule_summary: r.rule_summary,
      });
    } else if (prev.rule_summary.trim() !== r.rule_summary.trim()) {
      changed.push({
        previous_rule_id: prev.id,
        condition_name: r.condition_name,
        rule_type: r.rule_type,
        previous_summary: prev.rule_summary,
        new_summary: r.rule_summary,
      });
    }
  }

  for (const [key, prev] of oldByKey) {
    if (!newByKey.has(key)) {
      removed.push({
        rule_id: prev.id,
        condition_name: prev.condition_name,
        rule_type: prev.rule_type,
        rule_summary: prev.rule_summary,
      });
    }
  }

  return { added, changed, removed };
}

function matchKeyDrug(d: { drug_name: string; condition_trigger: string }) {
  return `${d.drug_name.toLowerCase().trim()}::${normCondition(d.condition_trigger)}`;
}

export function diffDrugsAgainstVerified(
 newDrugs: ParsedDrugRecord[],
  verified: VerifiedDrugSnapshot[]
): DrugDiffSummary {
  const newByKey = new Map<string, ParsedDrugRecord>();
  for (const d of newDrugs) {
    newByKey.set(matchKeyDrug(d), d);
  }
  const oldByKey = new Map<string, VerifiedDrugSnapshot>();
  for (const d of verified) {
    oldByKey.set(matchKeyDrug(d), d);
  }

  const added: DrugDiffSummary["added"] = [];
  const removed: DrugDiffSummary["removed"] = [];

  for (const d of newDrugs) {
    const key = matchKeyDrug(d);
    if (!oldByKey.has(key)) {
      added.push({ drug_name: d.drug_name, condition_trigger: d.condition_trigger });
    }
  }

  for (const d of verified) {
    const key = matchKeyDrug(d);
    if (!newByKey.has(key)) {
      removed.push({
        drug_rule_id: d.id,
        drug_name: d.drug_name,
        condition_trigger: d.condition_trigger,
      });
    }
  }

  return { added, removed };
}
