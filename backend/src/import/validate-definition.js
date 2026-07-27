/**
 * Validation for field definitions that were written by hand.
 *
 * Fields extracted from an AcroForm are trustworthy by construction — the
 * coordinates come from the document. Fields that arrive over the API do not:
 * they were typed, or produced by a designer UI, and the failure modes are
 * quiet ones. A y coordinate measured from the top instead of the bottom puts
 * a signature box on the wrong half of the page; a page index of 1 on a
 * single-page document drops the field silently, because stampPdf skips a
 * field whose page is missing rather than crashing.
 *
 * So this rejects at the boundary, with messages naming the field and what is
 * wrong with it. Better a 400 than a contract signed in the wrong place.
 */

export const FIELD_KINDS = ['text', 'multiline', 'date', 'checkbox', 'signature', 'initials'];

/**
 * PDF user-space units of slack allowed at a page edge.
 *
 * A widget rectangle includes its border, so a field drawn flush to the edge
 * of a page measures fractionally larger than the page itself. Rejecting that
 * would fail documents that are perfectly fine.
 */
const EDGE_TOLERANCE = 1;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Checks one field against the page it claims to sit on.
 *
 * `pages` is the real geometry of the stored document, never the caller's
 * idea of it — a definition that disagrees with its own PDF is exactly the
 * case being guarded against.
 */
function validateField(field, index, pages, seenIds) {
  const where = `fields[${index}]`;

  if (!field || typeof field !== 'object') return `${where} must be an object`;

  if (typeof field.id !== 'string' || !field.id.trim()) {
    return `${where}.id is required and must be a non-empty string`;
  }
  if (seenIds.has(field.id)) {
    // Values are filed under the field id, so a duplicate means one field
    // silently overwrites the other's answer.
    return `${where}.id "${field.id}" is used more than once`;
  }
  seenIds.add(field.id);

  if (!FIELD_KINDS.includes(field.kind)) {
    return `${where}.kind must be one of: ${FIELD_KINDS.join(', ')}`;
  }
  if (field.label !== undefined && typeof field.label !== 'string') {
    return `${where}.label must be a string`;
  }

  const rect = field.rect;
  if (!rect || typeof rect !== 'object') return `${where}.rect is required`;

  for (const key of ['x', 'y', 'width', 'height']) {
    if (!isFiniteNumber(rect[key])) return `${where}.rect.${key} must be a finite number`;
  }
  if (!Number.isInteger(rect.page) || rect.page < 0) {
    return `${where}.rect.page must be a page index (0 or greater)`;
  }
  if (rect.page >= pages.length) {
    return (
      `${where}.rect.page is ${rect.page}, but the document has ` +
      `${pages.length} page(s) — indexes are 0-based`
    );
  }
  if (rect.width <= 0 || rect.height <= 0) {
    return `${where}.rect must have a positive width and height`;
  }

  const page = pages[rect.page];
  if (rect.x < -EDGE_TOLERANCE || rect.y < -EDGE_TOLERANCE) {
    return (
      `${where}.rect sits off the page (x ${rect.x}, y ${rect.y}). ` +
      'Coordinates are in PDF units with the origin at the BOTTOM-left.'
    );
  }
  if (
    rect.x + rect.width > page.width + EDGE_TOLERANCE ||
    rect.y + rect.height > page.height + EDGE_TOLERANCE
  ) {
    return (
      `${where}.rect extends past the page, which is ${page.width}x${page.height}. ` +
      'Coordinates are in PDF units with the origin at the BOTTOM-left.'
    );
  }

  if (field.required !== undefined && typeof field.required !== 'boolean') {
    return `${where}.required must be a boolean`;
  }
  if (field.bindTo !== undefined && typeof field.bindTo !== 'string') {
    return `${where}.bindTo must be a string naming a client property`;
  }
  if (
    field.maxLength !== undefined &&
    (!Number.isInteger(field.maxLength) || field.maxLength <= 0)
  ) {
    return `${where}.maxLength must be a positive integer`;
  }
  if (field.defaultValue !== undefined && typeof field.defaultValue !== 'string') {
    return `${where}.defaultValue must be a string`;
  }

  return null;
}

/**
 * Validates a replacement field list. Returns an error message, or null.
 *
 * An empty array is allowed: clearing every field off a document is a
 * legitimate way to start over, and the signing route already refuses to sign
 * a form that has nothing on it to sign.
 */
export function validateFields(fields, pages) {
  if (!Array.isArray(fields)) return 'fields must be an array';
  if (!Array.isArray(pages) || !pages.length) return 'the stored document has no page geometry';

  const seenIds = new Set();
  for (let i = 0; i < fields.length; i++) {
    const error = validateField(fields[i], i, pages, seenIds);
    if (error) return error;
  }
  return null;
}

/**
 * Validates a whole hand-authored definition. Returns an error message, or null.
 *
 * `pages` comes from the uploaded PDF rather than the submitted definition, so
 * a caller cannot describe a page geometry the document does not have and slip
 * fields past the bounds check.
 */
export function validateAuthoredDefinition(definition, pages) {
  if (!definition || typeof definition !== 'object') {
    return 'definition must be a JSON object';
  }
  if (typeof definition.title !== 'string' || !definition.title.trim()) {
    return 'definition.title is required';
  }
  if (definition.version !== undefined && typeof definition.version !== 'string') {
    return 'definition.version must be a string';
  }
  return validateFields(definition.fields ?? [], pages);
}

/**
 * Advances a semver-ish version after a field change.
 *
 * Signed records cite the form version they were captured against, so a form
 * whose fields moved must not keep claiming to be the version people already
 * signed. Anything that is not `major.minor.patch` is left alone rather than
 * mangled — the caller can set an explicit version instead.
 */
export function bumpMinor(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version ?? ''));
  if (!match) return version;
  return `${match[1]}.${Number(match[2]) + 1}.0`;
}
