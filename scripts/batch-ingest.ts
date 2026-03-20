/**
 * Batch upload PDFs from a folder, create source_documents rows, and run extraction.
 *
 * Prerequisites:
 *   - .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATALAB_API_KEY
 *   - Carriers already exist in DB with matching slugs
 *   - JSON map: exact filename -> carrier slug (see medsupp-file-to-slug.example.json)
 *
 * Usage:
 *   pnpm run batch-ingest -- "./MedSupp UW Guides" "./scripts/medsupp-file-to-slug.json"
 *
 * Or directly:
 *   npx tsx --env-file=.env.local scripts/batch-ingest.ts "./MedSupp UW Guides" "./scripts/medsupp-file-to-slug.json"
 */

import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { runExtractionForDocument } from "../src/lib/ingestion/run-extraction";

const DEFAULT_BUCKET = "uw-documents";

function sanitizeFileName(fileName: string) {
  return fileName.toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-");
}

async function main() {
  const dir = resolve(process.argv[2] || "./MedSupp UW Guides");
  const mapPath = resolve(process.argv[3] || "./scripts/medsupp-file-to-slug.json");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!process.env.DATALAB_API_KEY) {
    console.error("Missing DATALAB_API_KEY (required for extraction)");
    process.exit(1);
  }

  let fileToSlug: Record<string, string>;
  try {
    fileToSlug = JSON.parse(readFileSync(mapPath, "utf8")) as Record<string, string>;
  } catch (e) {
    console.error("Could not read map JSON:", mapPath, e);
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET;

  const { data: carriers, error: cErr } = await supabase.from("carriers").select("id, slug");
  if (cErr || !carriers?.length) {
    console.error("Carriers lookup failed:", cErr?.message);
    process.exit(1);
  }
  const slugToId = new Map(carriers.map((c) => [c.slug, c.id]));

  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(".pdf"))
    .map((d) => d.name);

  if (!entries.length) {
    console.error("No PDFs in", dir);
    process.exit(1);
  }

  const version = Number(process.env.BATCH_INGEST_VERSION || "1");
  const systemUser = process.env.BATCH_INGEST_UPLOADED_BY || null;

  for (const name of entries) {
    const slug = fileToSlug[name];
    if (!slug) {
      console.warn("Skip (no map entry):", name);
      continue;
    }
    const carrierId = slugToId.get(slug);
    if (!carrierId) {
      console.warn("Skip (unknown carrier slug):", slug, name);
      continue;
    }

    const fullPath = join(dir, name);
    const buf = readFileSync(fullPath);
    const safeName = sanitizeFileName(name);
    const storagePath = `${carrierId}/${Date.now()}-${randomUUID()}-${safeName}`;

    const { error: upErr } = await supabase.storage.from(bucket).upload(storagePath, buf, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) {
      console.error("Upload failed", name, upErr.message);
      continue;
    }

    const insertRow: Record<string, unknown> = {
      carrier_id: carrierId,
      filename: name,
      storage_path: storagePath,
      document_type: "uw_guide",
      effective_date: null,
      expiration_date: null,
      version: Number.isFinite(version) && version >= 1 ? Math.floor(version) : 1,
      status: "uploaded",
    };
    if (systemUser) insertRow.uploaded_by = systemUser;

    const { data: doc, error: insErr } = await supabase
      .from("source_documents")
      .insert(insertRow)
      .select("id")
      .single();

    if (insErr || !doc) {
      console.error("DB insert failed", name, insErr?.message);
      await supabase.storage.from(bucket).remove([storagePath]);
      continue;
    }

    console.log("Uploaded", name, "->", doc.id);

    try {
      const result = await runExtractionForDocument(supabase, doc.id, { bucket });
      console.log(
        "  Extracted",
        result.extracted_rules,
        "rules,",
        result.extracted_drug_rules,
        "drug rules"
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("  Extraction failed:", msg);
      await supabase
        .from("source_documents")
        .update({
          status: "failed",
          marker_json: { error: msg, failed_at: new Date().toISOString() },
        })
        .eq("id", doc.id);
    }
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
