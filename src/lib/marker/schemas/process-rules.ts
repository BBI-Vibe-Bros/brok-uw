export const processRulesExtractionSchema = {
  name: "process_and_state_rules",
  description: "Rules about application process, lookback windows, BMI, and state requirements.",
  schema: {
    type: "object",
    properties: {
      process_rules: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string" },
            condition_name: { type: "string" },
            decision: { type: "string", enum: ["decline", "conditional", "acceptable", "review_required"] },
            lookback_months: { type: "number" },
            rule_summary: { type: "string" },
          },
          required: ["category", "condition_name", "decision", "rule_summary"],
        },
      },
    },
    required: ["process_rules"],
  },
} as const;
