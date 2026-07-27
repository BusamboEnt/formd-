import { FormField, FormOrigin, FormPage } from './form-field.model';

/**
 * A form whose fields are positioned on a source document.
 *
 * This is the overlay model: the PDF referenced here is the artifact the client
 * signs, and fields sit on top of it at fixed coordinates. It exists alongside
 * `AgreementTemplate` (prose clauses rendered in FormD's own styling) rather
 * than replacing it — the two answer different needs, and the clause model is
 * still the right shape for an agreement authored here rather than imported.
 */
export interface FormDefinition {
  id: string;
  title: string;
  /** Bump on any change to the document or the fields, so a saved record can
   *  be traced to exactly what was presented. */
  version: string;
  document: FormDocumentRef;
  fields: FormField[];
  origin: FormOrigin;
}

export interface FormDocumentRef {
  /** Where the pinned PDF can be fetched from. */
  url: string;
  filename: string;
  /** Always PDF: anything imported is normalised to it, because a fixed page
   *  geometry is what makes coordinate-positioned fields meaningful. A .docx
   *  reflows, so its layout is pinned at import time and never re-derived. */
  contentType: 'application/pdf';
  pages: FormPage[];
  /** SHA-256 of the PDF bytes. A signed record cites this, so a document
   *  swapped after signing is detectable rather than silent. */
  sha256?: string;
}

/** A captured value, keyed by `FormField.id`. Drawn fields hold a data URL. */
export type FieldValue = string | boolean;

export type FieldValues = Record<string, FieldValue>;
