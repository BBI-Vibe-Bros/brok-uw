import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminRouteClient } from "@/lib/supabase/server";
import { requireAdminAuth } from "@/lib/auth/admin";
import { logAudit } from "@/lib/audit/log";
import { isAdminDocumentType } from "@/lib/documents/document-types";

const DEFAULT_BUCKET = "uw-documents";
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function sanitizeFileName(fileName: string) {
  return fileName.toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-");
}

export async function GET() {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) {
    return auth;
  }

  const supabase = await createAdminRouteClient();
  const { data, error } = await supabase
    .from("source_documents")
    .select(
      "id, carrier_id, filename, document_type, version, status, uploaded_at, effective_date, expiration_date, carriers(name)"
    )
    .order("uploaded_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) {
    return auth;
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const carrierId = String(formData.get("carrier_id") ?? "").trim();
  const documentType = String(formData.get("document_type") ?? "uw_guide").trim();
  if (!isAdminDocumentType(documentType)) {
    return NextResponse.json(
      {
        error: `Invalid document_type. Allowed: uw_guide, medsupp_application.`,
      },
      { status: 400 }
    );
  }
  const effectiveDate = String(formData.get("effective_date") ?? "").trim();
  const expirationDate = String(formData.get("expiration_date") ?? "").trim();
  const version = Number(formData.get("version") ?? 1);

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }
  if (!carrierId) {
    return NextResponse.json({ error: "Carrier is required" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Only PDF, DOC, and DOCX files are supported" },
      { status: 400 }
    );
  }
  if (!Number.isFinite(version) || version < 1) {
    return NextResponse.json({ error: "Version must be at least 1" }, { status: 400 });
  }

  const bucket = process.env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET;
  const supabase = await createAdminRouteClient();

  const safeName = sanitizeFileName(file.name);
  const storagePath = `${carrierId}/${Date.now()}-${randomUUID()}-${safeName}`;
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, fileBuffer, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    const message =
      uploadError.message?.includes("Bucket not found")
        ? `Storage bucket "${bucket}" was not found. Set SUPABASE_STORAGE_BUCKET in .env.local to an existing bucket (for example: uw-documents).`
        : uploadError.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data, error: insertError } = await supabase
    .from("source_documents")
    .insert({
      carrier_id: carrierId,
      filename: file.name,
      storage_path: storagePath,
      document_type: documentType,
      effective_date: effectiveDate || null,
      expiration_date: expirationDate || null,
      version: Math.floor(version),
      status: "uploaded",
      uploaded_by: auth.userId,
    })
    .select("id, filename, document_type, version, status, uploaded_at")
    .single();

  if (insertError) {
    await supabase.storage.from(bucket).remove([storagePath]);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  logAudit(supabase, auth.userId, "admin.upload", "source_document", data?.id, {
    filename: file.name,
    document_type: documentType,
    carrier_id: carrierId,
  }).catch(() => {});

  return NextResponse.json({ document: data }, { status: 201 });
}
