import type { StructuredQuery } from "@/lib/ai/types";
import type { CarrierResult } from "@/types/chat-results";
import {
  drugCarrierName,
  drugRowCitation,
  type DrugSearchRow,
} from "@/lib/db/queries/drug-search";
import {
  ruleCarrierName,
  ruleRowCitation,
  type RuleSearchRow,
} from "@/lib/db/queries/rules-search";

type Verdict = CarrierResult["verdict"];

function decisionRank(d: string): number {
  const x = d.toLowerCase();
  if (x === "decline") return 3;
  if (x === "conditional" || x === "review_required") return 2;
  if (x === "acceptable") return 1;
  return 0;
}

function verdictFromRank(rank: number): Verdict {
  if (rank >= 3) return "decline";
  if (rank >= 2) return "conditional";
  if (rank >= 1) return "likely_approve";
  return "unknown";
}

function avgConfidence(rules: RuleSearchRow[], drugRows: DrugSearchRow[]): number {
  const scores: number[] = [];
  for (const r of rules) {
    if (r.confidence_score != null && Number.isFinite(r.confidence_score)) {
      scores.push(Math.min(1, Math.max(0, r.confidence_score)));
    }
  }
  for (const _ of drugRows) scores.push(0.62);
  if (!scores.length) return 0.45;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Group rule + drug matches by carrier and build `CarrierResult` cards.
 */
export function scoreCarrierResults(
  structured: StructuredQuery,
  rules: RuleSearchRow[],
  drugs: DrugSearchRow[]
): CarrierResult[] {
  const byCarrier = new Map<string, { rules: RuleSearchRow[]; drugs: DrugSearchRow[] }>();

  for (const r of rules) {
    const cur = byCarrier.get(r.carrier_id) ?? { rules: [], drugs: [] };
    cur.rules.push(r);
    byCarrier.set(r.carrier_id, cur);
  }
  for (const d of drugs) {
    const cur = byCarrier.get(d.carrier_id) ?? { rules: [], drugs: [] };
    cur.drugs.push(d);
    byCarrier.set(d.carrier_id, cur);
  }

  const results: CarrierResult[] = [];

  for (const [carrierId, { rules: rs, drugs: ds }] of byCarrier) {
    let maxRank = 0;
    for (const r of rs) {
      maxRank = Math.max(maxRank, decisionRank(r.decision));
      if (r.rule_type?.toLowerCase() === "knockout" && r.decision?.toLowerCase() === "decline") {
        maxRank = Math.max(maxRank, 3);
      }
    }
    for (const d of ds) {
      maxRank = Math.max(maxRank, decisionRank(d.decision));
    }

    const verdict = verdictFromRank(maxRank);

    const knockout_conditions: string[] = [];
    const conditional_notes: string[] = [];
    const reasons: string[] = [];

    for (const r of rs) {
      const line = `${r.condition_name}: ${r.rule_summary}`.trim();
      if (r.rule_type?.toLowerCase() === "knockout" && r.decision?.toLowerCase() === "decline") {
        knockout_conditions.push(line);
      } else if (r.decision?.toLowerCase() === "conditional" || r.decision?.toLowerCase() === "review_required") {
        conditional_notes.push(line);
      } else if (line) {
        reasons.push(line);
      }
    }
    for (const d of ds) {
      const line = `${d.drug_name}${d.condition_trigger ? ` (${d.condition_trigger})` : ""}: ${d.notes || d.decision}`;
      if (d.decision?.toLowerCase() === "decline") {
        knockout_conditions.push(line);
      } else if (d.decision?.toLowerCase() === "conditional") {
        conditional_notes.push(line);
      } else {
        reasons.push(line);
      }
    }

    const follow: string[] = [];
    if (verdict === "unknown" || !rs.length && !ds.length) {
      follow.push("Confirm all diagnoses and medications with the client's medication list.");
    }
    if (!structured.state) {
      follow.push("What state is the client applying in? State-specific rules may apply.");
    }

    let citation: CarrierResult["citation"] = null;
    const declineRule = rs.find(
      (r) => r.decision?.toLowerCase() === "decline" || r.rule_type?.toLowerCase() === "knockout"
    );
    const declineDrug = ds.find((d) => d.decision?.toLowerCase() === "decline");
    if (declineRule) {
      citation = ruleRowCitation(declineRule);
    } else if (declineDrug) {
      citation = drugRowCitation(declineDrug);
    } else if (rs[0]) {
      citation = ruleRowCitation(rs[0]);
    } else if (ds[0]) {
      citation = drugRowCitation(ds[0]);
    }

    const name = rs[0] ? ruleCarrierName(rs[0]) : drugCarrierName(ds[0]!);

    results.push({
      carrier_id: carrierId,
      carrier_name: name,
      verdict,
      reasons: reasons.slice(0, 8),
      knockout_conditions: knockout_conditions.slice(0, 8),
      conditional_notes: conditional_notes.slice(0, 8),
      follow_up_questions: follow.slice(0, 5),
      citation,
      confidence: avgConfidence(rs, ds),
    });
  }

  const vOrder: Record<Verdict, number> = {
    decline: 0,
    conditional: 1,
    likely_approve: 2,
    unknown: 3,
  };
  results.sort((a, b) => vOrder[a.verdict] - vOrder[b.verdict] || b.confidence - a.confidence);

  return results;
}
