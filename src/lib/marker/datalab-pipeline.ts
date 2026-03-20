/**
 * Datalab Marker: Convert (with checkpoint) + optional structured Extract.
 * Docs: https://documentation.datalab.to/docs/recipes/conversion/conversion-api-overview
 */

import { getUnderwritingSchemaJson } from "@/lib/marker/combined-extract-schema";
import type { MarkerExtractResult, StructuredUwExtraction } from "@/lib/marker/types";

const DEFAULT_BASE = "https://www.datalab.to/api/v1";
const POLL_MS = 2000;
const MAX_POLLS = 90;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function parseJsonSafe(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getApiKey(): string {
  const key = process.env.DATALAB_API_KEY;
  if (!key) throw new Error("Missing DATALAB_API_KEY");
  return key;
}

function getBaseUrl(): string {
  return process.env.DATALAB_API_URL || DEFAULT_BASE;
}

function mimeFromName(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".doc")) return "application/msword";
  return "application/octet-stream";
}

async function pollCheckUrl(
  checkUrl: string,
  apiKey: string,
  extractMarkdown: (p: Record<string, unknown>) => string | null
): Promise<Record<string, unknown>> {
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_MS);
    const res = await fetch(checkUrl, { headers: { "X-API-Key": apiKey } });
    const payload = await parseJsonSafe(res);
    if (!res.ok) {
      throw new Error(
        typeof payload.error === "string"
          ? payload.error
          : "Datalab polling failed"
      );
    }
    const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "";
    if (status === "failed" || status === "error") {
      throw new Error(
        typeof payload.error === "string" ? payload.error : "Datalab reported failure"
      );
    }
    if (status === "complete" || payload.success === true) {
      if (extractMarkdown(payload)) return payload;
      if (payload.extraction_schema_json != null) return payload;
      if (payload.markdown || payload.json) return payload;
    }
  }
  throw new Error("Datalab conversion timed out");
}

function markdownFromPayload(payload: Record<string, unknown>): string | null {
  if (typeof payload.markdown === "string" && payload.markdown.length > 0) {
    return payload.markdown;
  }
  return null;
}

function checkpointFromPayload(payload: Record<string, unknown>): string | null {
  if (typeof payload.checkpoint_id === "string") return payload.checkpoint_id;
  return null;
}

/**
 * Convert document to markdown; optionally returns checkpoint for Extract API.
 */
export async function datalabConvertWithCheckpoint(options: {
  fileName: string;
  fileBuffer: Buffer;
  mimeType?: string;
}): Promise<{ markdown: string; checkpointId: string | null; raw: Record<string, unknown> }> {
  const apiKey = getApiKey();
  const base = getBaseUrl();
  const form = new FormData();
  const bytes = new Uint8Array(options.fileBuffer);
  form.set(
    "file",
    new File([new Blob([bytes])], options.fileName, {
      type: options.mimeType || mimeFromName(options.fileName),
    })
  );
  form.set("output_format", "markdown");
  form.set("mode", process.env.DATALAB_MODE || "balanced");
  form.set("save_checkpoint", "true");

  const res = await fetch(`${base}/convert`, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: form,
  });
  const first = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(
      typeof first.error === "string"
        ? first.error
        : typeof first.detail === "string"
          ? first.detail
          : "Datalab convert request failed"
    );
  }

  const mdImmediate = markdownFromPayload(first);
  const ckImmediate = checkpointFromPayload(first);
  if (mdImmediate) {
    return { markdown: mdImmediate, checkpointId: ckImmediate, raw: first };
  }

  const checkUrl =
    typeof first.request_check_url === "string" ? first.request_check_url : null;
  if (!checkUrl) {
    throw new Error("Datalab convert did not return markdown or request_check_url");
  }

  const finalPayload = await pollCheckUrl(checkUrl, apiKey, markdownFromPayload);
  const markdown = markdownFromPayload(finalPayload);
  if (!markdown) {
    throw new Error("Datalab convert completed without markdown");
  }
  return {
    markdown,
    checkpointId: checkpointFromPayload(finalPayload),
    raw: finalPayload,
  };
}

function parseStructuredFromPayload(payload: Record<string, unknown>): StructuredUwExtraction | null {
  const raw =
    typeof payload.extraction_schema_json === "string"
      ? payload.extraction_schema_json
      : null;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StructuredUwExtraction;
  } catch {
    return null;
  }
}

/**
 * Run structured extraction using a checkpoint (no re-parse of PDF).
 */
export async function datalabExtractStructured(options: {
  checkpointId: string;
  fileName: string;
  fileBuffer: Buffer;
  mimeType?: string;
}): Promise<{ structured: StructuredUwExtraction | null; raw: Record<string, unknown> }> {
  const apiKey = getApiKey();
  const base = getBaseUrl();
  const form = new FormData();
  const bytes = new Uint8Array(options.fileBuffer);
  form.set(
    "file",
    new File([new Blob([bytes])], options.fileName, {
      type: options.mimeType || mimeFromName(options.fileName),
    })
  );
  form.set("checkpoint_id", options.checkpointId);
  form.set("page_schema", getUnderwritingSchemaJson());
  form.set("mode", process.env.DATALAB_MODE || "balanced");

  const res = await fetch(`${base}/extract`, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: form,
  });
  const first = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(
      typeof first.error === "string"
        ? first.error
        : typeof first.detail === "string"
          ? first.detail
          : "Datalab extract request failed"
    );
  }

  let structured = parseStructuredFromPayload(first);
  if (structured) return { structured, raw: first };

  const checkUrl =
    typeof first.request_check_url === "string" ? first.request_check_url : null;
  if (!checkUrl) {
    return { structured: null, raw: first };
  }

  const finalPayload = await pollCheckUrl(checkUrl, apiKey, () => null);
  structured = parseStructuredFromPayload(finalPayload);
  return { structured, raw: finalPayload };
}

/**
 * Full pipeline: convert → markdown + checkpoint → structured extract (best effort).
 */
export async function runDatalabFullPipeline(options: {
  fileName: string;
  fileBuffer: Buffer;
  mimeType?: string;
}): Promise<MarkerExtractResult & { structured: StructuredUwExtraction | null }> {
  const converted = await datalabConvertWithCheckpoint(options);
  let structured: StructuredUwExtraction | null = null;
  let extractRaw: Record<string, unknown> | null = null;

  if (converted.checkpointId) {
    try {
      const extracted = await datalabExtractStructured({
        checkpointId: converted.checkpointId,
        fileName: options.fileName,
        fileBuffer: options.fileBuffer,
        mimeType: options.mimeType,
      });
      structured = extracted.structured;
      extractRaw = extracted.raw;
    } catch (err) {
      console.warn("Datalab structured extract failed (markdown still available):", err);
    }
  }

  return {
    markdown: converted.markdown,
    checkpointId: converted.checkpointId,
    raw: {
      convert: converted.raw,
      extract: extractRaw,
    },
    structured,
  };
}
