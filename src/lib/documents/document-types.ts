/** Stored on `source_documents.document_type` (text column). */
export const DOCUMENT_TYPE_UW_GUIDE = "uw_guide";
export const DOCUMENT_TYPE_MEDSUPP_APPLICATION = "medsupp_application";

export const ADMIN_DOCUMENT_TYPES = [DOCUMENT_TYPE_UW_GUIDE, DOCUMENT_TYPE_MEDSUPP_APPLICATION] as const;
export type AdminDocumentType = (typeof ADMIN_DOCUMENT_TYPES)[number];

export function isAdminDocumentType(v: string): v is AdminDocumentType {
  return (ADMIN_DOCUMENT_TYPES as readonly string[]).includes(v);
}

export const DOCUMENT_TYPE_LABELS: Record<AdminDocumentType, string> = {
  [DOCUMENT_TYPE_UW_GUIDE]: "Underwriting Guide",
  [DOCUMENT_TYPE_MEDSUPP_APPLICATION]: "Med Supp Application",
};
