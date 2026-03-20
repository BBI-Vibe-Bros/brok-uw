import { runDatalabFullPipeline } from "@/lib/marker/datalab-pipeline";
import type { MarkerExtractOptions, MarkerExtractResult } from "@/lib/marker/types";

const DEFAULT_MARKER_BASE_URL = "https://www.datalab.to/api/v1";
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_POLL_ATTEMPTS = 30;

function getContentTypeFromFileName(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "application/octet-stream";
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function parseJsonSafe(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

function parseMarkdownFromPayload(payload: Record<string, unknown>) {
  if (typeof payload.markdown === "string") {
    return payload.markdown;
  }
  if (typeof payload.output_markdown === "string") {
    return payload.output_markdown;
  }
  if (payload.result && typeof payload.result === "object") {
    const result = payload.result as Record<string, unknown>;
    if (typeof result.markdown === "string") {
      return result.markdown;
    }
    if (typeof result.output_markdown === "string") {
      return result.output_markdown;
    }
  }
  return "";
}

function parseCheckpointIdFromPayload(payload: Record<string, unknown>) {
  if (typeof payload.checkpoint_id === "string") {
    return payload.checkpoint_id;
  }
  if (payload.result && typeof payload.result === "object") {
    const result = payload.result as Record<string, unknown>;
    if (typeof result.checkpoint_id === "string") {
      return result.checkpoint_id;
    }
  }
  return null;
}

function parseErrorMessage(payload: Record<string, unknown>, fallback: string) {
  if (typeof payload.detail === "string") return payload.detail;
  if (typeof payload.error === "string") return payload.error;
  if (typeof payload.message === "string") return payload.message;
  return fallback;
}

/** Legacy single-call /marker endpoint (set DATALAB_LEGACY_MARKER=true to use). */
async function extractWithLegacyMarker({
  fileName,
  fileBuffer,
  mimeType,
}: MarkerExtractOptions): Promise<MarkerExtractResult> {
  const apiKey = process.env.DATALAB_API_KEY;
  if (!apiKey) {
    throw new Error("Missing DATALAB_API_KEY");
  }

  const baseUrl = process.env.DATALAB_API_URL || DEFAULT_MARKER_BASE_URL;
  const formData = new FormData();
  const fileBytes = new Uint8Array(fileBuffer);
  formData.set(
    "file",
    new File([new Blob([fileBytes])], fileName, {
      type: mimeType || getContentTypeFromFileName(fileName),
    })
  );
  formData.set("output_format", "markdown");

  const response = await fetch(`${baseUrl}/marker`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
    },
    body: formData,
  });

  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    const message = parseErrorMessage(
      payload,
      "Marker extraction failed when creating conversion request"
    );
    if (response.status === 401 || /invalid api key/i.test(message)) {
      throw new Error(
        "Datalab authentication failed. Check DATALAB_API_KEY and ensure it is active."
      );
    }
    throw new Error(message);
  }

  const directMarkdown = parseMarkdownFromPayload(payload);
  if (directMarkdown) {
    return {
      markdown: directMarkdown,
      checkpointId: parseCheckpointIdFromPayload(payload),
      raw: payload,
      structured: null,
    };
  }

  const requestCheckUrl =
    typeof payload.request_check_url === "string" ? payload.request_check_url : null;
  if (!requestCheckUrl) {
    throw new Error("Marker did not return a polling URL (request_check_url).");
  }

  const pollInterval = Number(process.env.DATALAB_POLL_INTERVAL_MS || DEFAULT_POLL_INTERVAL_MS);
  const maxPollAttempts = Number(
    process.env.DATALAB_MAX_POLL_ATTEMPTS || DEFAULT_MAX_POLL_ATTEMPTS
  );

  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    await sleep(pollInterval);

    const pollResponse = await fetch(requestCheckUrl, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
      },
    });
    const pollPayload = await parseJsonSafe(pollResponse);

    if (!pollResponse.ok) {
      const message = parseErrorMessage(
        pollPayload,
        "Marker polling failed while waiting for conversion result"
      );
      throw new Error(message);
    }

    const markdown = parseMarkdownFromPayload(pollPayload);
    if (markdown) {
      return {
        markdown,
        checkpointId: parseCheckpointIdFromPayload(pollPayload),
        raw: pollPayload,
        structured: null,
      };
    }

    const status = typeof pollPayload.status === "string" ? pollPayload.status.toLowerCase() : "";
    if (status === "failed" || status === "error") {
      const message = parseErrorMessage(pollPayload, "Marker reported failed conversion");
      throw new Error(message);
    }
  }

  throw new Error("Marker conversion timed out before markdown was available.");
}

/**
 * Default: Convert API + checkpoint + structured Extract (Phase 2).
 * Fallback: DATALAB_LEGACY_MARKER=true uses /marker only.
 */
export async function extractWithMarker(opts: MarkerExtractOptions): Promise<MarkerExtractResult> {
  if (process.env.DATALAB_LEGACY_MARKER === "true") {
    return extractWithLegacyMarker(opts);
  }
  return runDatalabFullPipeline({
    fileName: opts.fileName,
    fileBuffer: opts.fileBuffer,
    mimeType: opts.mimeType,
  });
}
