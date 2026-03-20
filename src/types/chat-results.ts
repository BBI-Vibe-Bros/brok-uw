/** Per-carrier result shown inline in chat (`CarrierResultCard`). */
export interface CarrierResult {
  carrier_id: string;
  carrier_name: string;
  verdict: "decline" | "conditional" | "likely_approve" | "unknown";
  reasons: string[];
  knockout_conditions: string[];
  conditional_notes: string[];
  follow_up_questions: string[];
  citation: {
    document: string;
    page: number | null;
    section: string | null;
    effective_date: string | null;
  } | null;
  confidence: number;
}
