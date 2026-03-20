function squashWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export interface ExtractedRuleLike {
  condition_name: string;
  rule_summary: string;
  rule_detail?: string | null;
  decision: "decline" | "conditional" | "acceptable" | "review_required";
  confidence_score?: number | null;
}

export function normalizeExtractedRule<T extends ExtractedRuleLike>(rule: T): T {
  const conditionName = toTitleCase(squashWhitespace(rule.condition_name));
  const summary = squashWhitespace(rule.rule_summary);
  const detail = rule.rule_detail ? squashWhitespace(rule.rule_detail) : null;
  const confidence =
    rule.confidence_score == null
      ? 0.55
      : Math.min(1, Math.max(0, Number.isFinite(rule.confidence_score) ? rule.confidence_score : 0.55));

  return {
    ...rule,
    condition_name: conditionName,
    rule_summary: summary,
    rule_detail: detail,
    confidence_score: confidence,
  };
}
