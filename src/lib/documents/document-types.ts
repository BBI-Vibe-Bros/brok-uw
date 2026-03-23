/** Stored on `source_documents.document_type` (text column). */
export const DOCUMENT_TYPE_UW_GUIDE = "uw_guide";
export const DOCUMENT_TYPE_UW_GUIDE_STATE = "uw_guide_state";
export const DOCUMENT_TYPE_MEDSUPP_APPLICATION = "medsupp_application";
export const DOCUMENT_TYPE_RATE_SHEET = "rate_sheet";
export const DOCUMENT_TYPE_PRODUCER_GUIDE = "producer_guide";
export const DOCUMENT_TYPE_DRUG_LIST = "drug_list";

export const ADMIN_DOCUMENT_TYPES = [
  DOCUMENT_TYPE_UW_GUIDE,
  DOCUMENT_TYPE_UW_GUIDE_STATE,
  DOCUMENT_TYPE_MEDSUPP_APPLICATION,
  DOCUMENT_TYPE_RATE_SHEET,
  DOCUMENT_TYPE_PRODUCER_GUIDE,
  DOCUMENT_TYPE_DRUG_LIST,
] as const;

export type AdminDocumentType = (typeof ADMIN_DOCUMENT_TYPES)[number];

export function isAdminDocumentType(v: string): v is AdminDocumentType {
  return (ADMIN_DOCUMENT_TYPES as readonly string[]).includes(v);
}

export interface DocTypeMeta {
  label: string;
  canExtract: boolean;
  isDownloadable: boolean;
}

export const DOC_TYPE_META: Record<AdminDocumentType, DocTypeMeta> = {
  [DOCUMENT_TYPE_UW_GUIDE]:            { label: "Underwriting Guide",       canExtract: true,  isDownloadable: false },
  [DOCUMENT_TYPE_UW_GUIDE_STATE]:      { label: "State-Specific UW Guide",  canExtract: true,  isDownloadable: false },
  [DOCUMENT_TYPE_DRUG_LIST]:           { label: "Drug List",                canExtract: true,  isDownloadable: false },
  [DOCUMENT_TYPE_MEDSUPP_APPLICATION]: { label: "Med Supp Application",     canExtract: false, isDownloadable: true  },
  [DOCUMENT_TYPE_RATE_SHEET]:          { label: "Rate Sheet",               canExtract: false, isDownloadable: true  },
  [DOCUMENT_TYPE_PRODUCER_GUIDE]:      { label: "Producer Guide",           canExtract: false, isDownloadable: true  },
};

export const DOCUMENT_TYPE_LABELS: Record<AdminDocumentType, string> = Object.fromEntries(
  Object.entries(DOC_TYPE_META).map(([k, v]) => [k, v.label])
) as Record<AdminDocumentType, string>;

/** Doc types whose content gets extracted into rules for the search pipeline. */
export const EXTRACTABLE_DOC_TYPES: AdminDocumentType[] = (
  Object.entries(DOC_TYPE_META) as [AdminDocumentType, DocTypeMeta][]
).filter(([, m]) => m.canExtract).map(([k]) => k);

/** Doc types that agents can request as downloads in chat. */
export const DOWNLOADABLE_DOC_TYPES: AdminDocumentType[] = (
  Object.entries(DOC_TYPE_META) as [AdminDocumentType, DocTypeMeta][]
).filter(([, m]) => m.isDownloadable).map(([k]) => k);
