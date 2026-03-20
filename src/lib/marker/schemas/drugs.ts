export const drugExtractionSchema = {
  name: "drug_condition_mappings",
  description: "Drug-level underwriting triggers and medication-to-condition mappings.",
  schema: {
    type: "object",
    properties: {
      drugs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            drug_name: { type: "string" },
            condition_trigger: { type: "string" },
            decision: { type: "string", enum: ["decline", "conditional", "acceptable"] },
            notes: { type: "string" },
          },
          required: ["drug_name", "condition_trigger", "decision"],
        },
      },
    },
    required: ["drugs"],
  },
} as const;
