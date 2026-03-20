export const knockoutExtractionSchema = {
  name: "knockout_conditions",
  description: "Condition-level hard decline and ineligible rule extraction.",
  schema: {
    type: "object",
    properties: {
      knockouts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            condition_name: { type: "string" },
            decision: { type: "string", enum: ["decline", "conditional", "acceptable"] },
            rule_summary: { type: "string" },
            source_quote: { type: "string" },
          },
          required: ["condition_name", "decision", "rule_summary"],
        },
      },
    },
    required: ["knockouts"],
  },
} as const;
