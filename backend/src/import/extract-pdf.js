import { createHash, randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

/**
 * Turns a PDF field name into something a person would read.
 * "client.full_name" -> "Client Full Name"
 */
function humanise(name) {
  return name
    .split(/[.\-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Maps a pdf-lib field to a FieldKind.
 *
 * A PDF has no notion of a signature field — only a text box — so an imported
 * contract would otherwise offer its signature line as somewhere to type a
 * name. Reading the author's intent from the field name recovers it often
 * enough to be worth doing.
 *
 * The order below matters. "date" is tested first because a contract routinely
 * carries fields named `signed.date`, `date_signed` or `signature_date`: every
 * one contains "sign", and classifying them as signatures would demand a drawn
 * image where a date belongs. The more specific signal wins.
 *
 * It is still a heuristic and can still be wrong — a field named
 * `design_notes` contains "sign" — so anything it misreads is correctable in
 * the definition.
 */
function classify(field) {
  const type = field.constructor.name;
  const name = field.getName().toLowerCase();

  if (type === 'PDFCheckBox' || type === 'PDFRadioGroup') return 'checkbox';

  if (type === 'PDFTextField') {
    if (/date|dob|birth/.test(name)) return 'date';
    if (/initial/.test(name)) return 'initials';
    if (/sign/.test(name)) return 'signature';
    try {
      if (typeof field.isMultiline === 'function' && field.isMultiline()) return 'multiline';
    } catch {
      // Older pdf-lib builds omit isMultiline; a single-line text field is the
      // safe assumption rather than a hard failure on an otherwise good import.
    }
    return 'text';
  }

  // Dropdowns and option lists collect a string; treated as text until the
  // schema grows a choice kind.
  return 'text';
}

/**
 * Reads a PDF and returns a FormDefinition-shaped object.
 *
 * Fields come from the document's own AcroForm, so their coordinates are the
 * original author's rather than ours. A PDF without an AcroForm yields zero
 * fields — that is not a failure, it is the common case for anything that was
 * never an interactive form, and the caller is told so via `origin`.
 */
export async function extractFormDefinition(pdfBuffer, { filename = 'document.pdf', id } = {}) {
  const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const pages = doc.getPages();

  const fields = [];
  for (const field of doc.getForm().getFields()) {
    const widgets = field.acroField.getWidgets();
    if (!widgets.length) continue;

    // A field can be placed on several pages; each widget is one placement.
    for (const widget of widgets) {
      const r = widget.getRectangle();
      const pageIndex = pages.findIndex((p) => p.ref === widget.P());
      fields.push({
        id: field.getName(),
        kind: classify(field),
        label: humanise(field.getName()),
        rect: {
          page: pageIndex < 0 ? 0 : pageIndex,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        },
      });
    }
  }

  const extracted = fields.length > 0;

  return {
    id: id ?? randomUUID(),
    title: filename.replace(/\.[^.]+$/, ''),
    version: '1.0.0',
    document: {
      url: '',
      filename,
      contentType: 'application/pdf',
      pages: pages.map((p) => ({ width: p.getWidth(), height: p.getHeight() })),
      sha256: createHash('sha256').update(pdfBuffer).digest('hex'),
    },
    fields,
    origin: {
      source: extracted ? 'acroform' : 'converted',
      originalFilename: filename,
      importedAt: new Date().toISOString(),
      ...(extracted
        ? {}
        : {
            note:
              'This document contains no interactive field definitions, so nothing ' +
              'could be positioned automatically. Fields must be placed by hand ' +
              'against the page coordinates before the form can be signed.',
          }),
    },
  };
}
