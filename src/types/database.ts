export type UserRole = "admin" | "agent";
export type SubscriptionTier = "brock_agent" | "paid" | "lead";
export type RuleType = "knockout" | "conditional" | "bmi" | "state_rule" | "process";
export type RuleStatus = "pending_review" | "verified" | "superseded" | "rejected";
export type DocumentStatus = "uploaded" | "processing" | "processed" | "failed";
export type RuleDecision = "decline" | "conditional" | "acceptable" | "review_required";

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  email: string;
  npn: string;
  role: UserRole;
  agency: string | null;
  license_state: string | null;
  states_licensed: string[] | null;
  subscription_tier: SubscriptionTier;
  is_brock_agent: boolean;
  created_at: string;
}

export interface Carrier {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  states_available: string[];
  contact_info: Record<string, unknown> | null;
  created_at: string;
}

export interface SourceDocument {
  id: string;
  carrier_id: string;
  filename: string;
  storage_path: string;
  document_type: string;
  effective_date: string | null;
  expiration_date: string | null;
  version: number;
  status: DocumentStatus;
  uploaded_by: string | null;
  uploaded_at: string;
  extracted_markdown: string | null;
  marker_checkpoint_id: string | null;
  marker_json: Record<string, unknown> | null;
}

export interface Rule {
  id: string;
  carrier_id: string;
  source_document_id: string | null;
  rule_type: RuleType;
  category: string | null;
  subcategory: string | null;
  condition_name: string;
  decision: RuleDecision;
  rule_summary: string;
  rule_detail: string | null;
  structured_data: Record<string, unknown> | null;
  applicable_states: string[];
  lookback_months: number | null;
  confidence_score: number | null;
  source_section: string | null;
  source_page: number | null;
  citation_block_ids: string[] | null;
  version: number;
  status: RuleStatus;
  verified_by: string | null;
  verified_at: string | null;
}

export interface DrugRule {
  id: string;
  carrier_id: string;
  source_document_id: string | null;
  drug_name: string;
  generic_name: string | null;
  brand_name: string | null;
  condition_trigger: string;
  is_conditional: boolean;
  decision: RuleDecision;
  notes: string | null;
  version: number;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  structured_query: Record<string, unknown> | null;
  results: Record<string, unknown> | null;
  created_at: string;
}
