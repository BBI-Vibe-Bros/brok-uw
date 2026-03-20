import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/log";
import { markExtractionFailed, runExtractionForDocument } from "@/lib/ingestion/run-extraction";

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json();
  const documentId = String(body?.document_id ?? "").trim();
  if (!documentId) {
    return NextResponse.json({ error: "document_id is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    const result = await runExtractionForDocument(supabase, documentId);
    const rulesDiff = result.marker_json.rules_diff as
      | { added?: unknown[]; changed?: unknown[]; removed?: unknown[] }
      | undefined;
    const drugsDiff = result.marker_json.drugs_diff as
      | { added?: unknown[]; removed?: unknown[] }
      | undefined;

    logAudit(supabase, auth.userId, "admin.extraction", "source_document", documentId, {
      rules_count: result.extracted_rules,
      drug_rules_count: result.extracted_drug_rules,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      document_id: documentId,
      extracted_rules: result.extracted_rules,
      extracted_drug_rules: result.extracted_drug_rules,
      diff: {
        rules: result.marker_json.rules_diff,
        drugs: result.marker_json.drugs_diff,
      },
      diff_summary: {
        rules: {
          added: rulesDiff?.added?.length ?? 0,
          changed: rulesDiff?.changed?.length ?? 0,
          removed: rulesDiff?.removed?.length ?? 0,
        },
        drugs: {
          added: drugsDiff?.added?.length ?? 0,
          removed: drugsDiff?.removed?.length ?? 0,
        },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Extraction failed";
    await markExtractionFailed(supabase, documentId, errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
