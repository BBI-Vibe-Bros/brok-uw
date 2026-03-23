/** Downloadable document kinds agents can request in chat. */
export type DownloadableDocKind =
  | "medsupp_application"
  | "rate_sheet"
  | "producer_guide";

/** When set, user wants a downloadable carrier artifact (not UW search). */
export interface DocumentRequest {
  kind: DownloadableDocKind;
  /** Raw carrier name from the user, if any. */
  carrier_mention: string | null;
}

export type QueryIntent =
  | "client_scenario"
  | "general_question"
  | "followup"
  | "greeting"
  | "document_request";

/** Parsed from natural language — drives DB search and ranking. */
export interface StructuredQuery {
  intent: QueryIntent;
  state: string | null;
  age: number | null;
  gender: string | null;
  conditions: string[];
  medications: string[];
  /** Carrier names the user wants to focus on (e.g. "Aetna", "INA"). */
  carrier_filter: string[];
  height_inches: number | null;
  weight_lbs: number | null;
  tobacco_use: boolean | null;
  additional_context: string | null;
  /** If non-empty, respond with a clarifying question instead of searching. */
  missing_fields: string[];
  /**
   * Med Supp application / form request. When present, chat should return a download link
   * instead of running UW search (even if conditions/meds also appear in the message).
   */
  document_request: DocumentRequest | null;
}

export type AiChatRole = "system" | "user" | "assistant";

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}

export interface AiCompleteOptions {
  temperature?: number;
  /** Ask the model to return JSON only (provider-specific). */
  jsonMode?: boolean;
}

export interface AiProvider {
  complete(messages: AiChatMessage[], options?: AiCompleteOptions): Promise<string>;
}
