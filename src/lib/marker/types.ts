export interface StructuredUwExtraction {
  knockout_conditions?: Array<{
    condition_name?: string;
    is_absolute?: boolean;
    lookback_months?: number;
    additional_criteria?: string;
    section_reference?: string;
  }>;
  drug_declines?: Array<{
    drug_name?: string;
    condition_trigger?: string;
    is_conditional?: boolean;
  }>;
  process_rules?: Array<{
    rule_type?: string;
    rule_text?: string;
    applicable_states?: string[];
  }>;
}

export interface MarkerExtractResult {
  markdown: string;
  checkpointId: string | null;
  raw: Record<string, unknown>;
  structured?: StructuredUwExtraction | null;
}

export interface MarkerExtractOptions {
  fileName: string;
  mimeType: string;
  fileBuffer: Buffer;
}
