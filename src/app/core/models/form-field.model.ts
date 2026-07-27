/**
 * What kind of input a field collects.
 *
 * `signature` and `initials` differ only in expected size and prompt — both
 * capture a drawn image rather than text — but keeping them distinct lets a
 * form require initials per page without relabelling a signature box.
 */
export type FieldKind =
  | 'text'
  | 'multiline'
  | 'date'
  | 'checkbox'
  | 'signature'
  | 'initials';

/**
 * Where a field sits on the source document.
 *
 * These are PDF user-space units (1/72"), and **the origin is the bottom-left
 * of the page, not the top-left**. That is the PDF convention and the one
 * pdf-lib reads and writes, so storing it this way avoids a flip on every read.
 * Renderers that work top-down convert once, at the edge.
 */
export interface FieldRect {
  /** 0-based page index. */
  page: number;
  x: number;
  /** Distance from the bottom of the page. */
  y: number;
  width: number;
  height: number;
}

export interface FormField {
  /** Stable key. This is what a captured value is filed under, so renaming it
   *  orphans previously collected data — treat it as an identifier, not a label. */
  id: string;
  kind: FieldKind;
  /** Shown to whoever fills the form. */
  label: string;
  rect: FieldRect;
  required?: boolean;
  /**
   * Pre-fill from the selected client record, e.g. `'name'` or
   * `'referenceNumber'`. Omitted means the field is entered by hand.
   */
  bindTo?: string;
  maxLength?: number;
  defaultValue?: string;
}

/** Page geometry, needed to position fields before the PDF is parsed client-side. */
export interface FormPage {
  width: number;
  height: number;
}

/** How a definition came to exist. Kept because it predicts field quality:
 *  'acroform' fields carry the original author's coordinates, while
 *  'converted' and 'authored' ones were placed by us and are worth reviewing. */
export type FormOriginSource = 'acroform' | 'converted' | 'authored';

export interface FormOrigin {
  source: FormOriginSource;
  originalFilename?: string;
  importedAt?: string;
  /** Set when a source document had no field definitions to extract. */
  note?: string;
}
