/**
 * Single JSON schema for Datalab structured extraction (underwriting guides).
 * Kept relatively flat per Datalab guidance.
 */
export const UNDERWRITING_COMBINED_SCHEMA = {
  type: "object",
  properties: {
    knockout_conditions: {
      type: "array",
      description: "Medical conditions or situations that result in decline or ineligibility",
      items: {
        type: "object",
        properties: {
          condition_name: { type: "string", description: "Condition or rule label" },
          is_absolute: {
            type: "boolean",
            description: "True if always a decline when present",
          },
          lookback_months: {
            type: "number",
            description: "Lookback period in months; 0 or omit if lifetime/unspecified",
          },
          additional_criteria: {
            type: "string",
            description: "Treatment, severity, or qualifying language",
          },
          section_reference: { type: "string", description: "Doc section heading if visible" },
        },
      },
    },
    drug_declines: {
      type: "array",
      description: "Medications that indicate decline or require UW review when tied to conditions",
      items: {
        type: "object",
        properties: {
          drug_name: { type: "string" },
          condition_trigger: {
            type: "string",
            description: "Condition the drug is prescribed for that triggers decline",
          },
          is_conditional: {
            type: "boolean",
            description: "True if only declined when prescribed for that condition",
          },
        },
      },
    },
    process_rules: {
      type: "array",
      description: "Enrollment, OE, GI, or submission process rules",
      items: {
        type: "object",
        properties: {
          rule_type: {
            type: "string",
            description: "e.g. open_enrollment, guaranteed_issue, underwriting, submission",
          },
          rule_text: { type: "string" },
          applicable_states: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
  },
} as const;

export function getUnderwritingSchemaJson(): string {
  return JSON.stringify(UNDERWRITING_COMBINED_SCHEMA);
}
