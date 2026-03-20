import { normalizeExtractedRule } from "@/lib/ai/rule-normalizer";

export interface ParsedRuleRecord {
  rule_type: "knockout" | "conditional" | "process" | "bmi" | "state_rule";
  category: string | null;
  condition_name: string;
  decision: "decline" | "conditional" | "acceptable" | "review_required";
  rule_summary: string;
  rule_detail: string | null;
  confidence_score: number;
}

export interface ParsedDrugRecord {
  drug_name: string;
  condition_trigger: string;
  decision: "decline" | "conditional" | "acceptable" | "review_required";
  notes: string | null;
}

const DRUG_LINE = /^[-*]\s+([A-Za-z0-9()\/+\-.,\s]{2,})\s*[:\-]\s*(.+)$/;

function pickDecision(value: string): ParsedRuleRecord["decision"] {
  const lower = value.toLowerCase();
  if (/(decline|deny|ineligible|not eligible|auto-?decline)/.test(lower)) return "decline";
  if (/(conditional|review|refer|needs approval)/.test(lower)) return "conditional";
  if (/(acceptable|standard|eligible)/.test(lower)) return "acceptable";
  return "review_required";
}

export function parseRulesFromMarkdown(markdown: string): ParsedRuleRecord[] {
  const lines = markdown.split(/\r?\n/);
  const rules: ParsedRuleRecord[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.length < 6) continue;

    const decision = pickDecision(line);
    if (decision === "review_required" && !/(bmi|lookback|state|process)/i.test(line)) {
      continue;
    }

    const [conditionChunk, ...rest] = line.split(/[:\-]/);
    const conditionName = conditionChunk.replace(/^[-*#\d.\s]+/, "").trim().slice(0, 100);
    const detail = rest.join(":").trim();

    if (!conditionName || conditionName.length < 2) continue;

    const ruleType: ParsedRuleRecord["rule_type"] =
      /bmi/i.test(line)
        ? "bmi"
        : /state/i.test(line)
          ? "state_rule"
          : /process|lookback|waiting period|application/i.test(line)
            ? "process"
            : decision === "decline"
              ? "knockout"
              : "conditional";

    const normalized = normalizeExtractedRule({
      condition_name: conditionName,
      decision,
      rule_summary: line.slice(0, 240),
      rule_detail: detail || null,
      confidence_score: decision === "review_required" ? 0.45 : 0.62,
    });

    rules.push({
      rule_type: ruleType,
      category: ruleType === "process" ? "process" : null,
      condition_name: normalized.condition_name,
      decision: normalized.decision,
      rule_summary: normalized.rule_summary,
      rule_detail: normalized.rule_detail ?? null,
      confidence_score: normalized.confidence_score ?? 0.55,
    });
  }

  return rules.slice(0, 300);
}

export function parseDrugRulesFromMarkdown(markdown: string): ParsedDrugRecord[] {
  const lines = markdown.split(/\r?\n/);
  const drugs: ParsedDrugRecord[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = line.match(DRUG_LINE);
    if (!match) continue;

    const left = match[1].trim();
    const right = match[2].trim();

    if (left.split(" ").length > 5 || left.length > 60) continue;
    if (!/[A-Za-z]/.test(left)) continue;
    if (!/(drug|med|rx|decline|condition|diagnosis|indicat)/i.test(right)) continue;

    const decision = pickDecision(right);
    drugs.push({
      drug_name: left,
      condition_trigger: right.slice(0, 160),
      decision,
      notes: right.slice(0, 240),
    });
  }

  return drugs.slice(0, 250);
}
