import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/** Values that read as an unticked box rather than a written answer. */
function isBlank(value) {
  return value === undefined || value === null || value === '' || value === false;
}

function parseDataUrl(value) {
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(String(value));
  if (!match) return null;
  return { format: match[1].toLowerCase(), base64: match[2] };
}

/**
 * Scales an image to fit a box without distorting it, and centres it.
 *
 * A signature stretched to fill its field is not the mark the person made, so
 * aspect ratio is preserved even though it leaves whitespace in wide boxes.
 */
function fitCentred(imgWidth, imgHeight, rect, padding = 2) {
  const boxW = Math.max(rect.width - padding * 2, 1);
  const boxH = Math.max(rect.height - padding * 2, 1);
  const scale = Math.min(boxW / imgWidth, boxH / imgHeight);
  const w = imgWidth * scale;
  const h = imgHeight * scale;
  return {
    x: rect.x + (rect.width - w) / 2,
    y: rect.y + (rect.height - h) / 2,
    width: w,
    height: h,
  };
}

/**
 * Writes captured values onto the document they were captured against.
 *
 * This is what the overlay model buys: the signed artifact is the client's own
 * PDF with marks added, not a re-rendering of it in our styling. The result is
 * flattened, so the fields become part of the page and cannot be edited
 * afterwards in a PDF reader.
 */
export async function stampPdf(pdfBuffer, definition, values = {}) {
  const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const pages = doc.getPages();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.06, 0.06, 0.07);

  const missingRequired = [];
  for (const field of definition.fields ?? []) {
    if (isBlank(values[field.id]) && field.required) missingRequired.push(field.id);
  }
  if (missingRequired.length) {
    throw new Error(`Missing required field(s): ${missingRequired.join(', ')}`);
  }

  // A record of a signed agreement that carries no signature is meaningless,
  // and the per-field `required` flags cannot be relied on to prevent it —
  // they come from the source document, and most PDFs never set them. So the
  // invariant is enforced here instead of being delegated to the author.
  //
  // Stated as "at least one", not "every signature field", because a document
  // may legitimately carry an optional second signature (a co-signer, a
  // witness) that would otherwise block signing whenever it went unused.
  const signatureFields = (definition.fields ?? []).filter(
    (f) => f.kind === 'signature' || f.kind === 'initials'
  );
  if (signatureFields.length && signatureFields.every((f) => isBlank(values[f.id]))) {
    throw new Error(
      `This document must be signed: ${signatureFields.map((f) => f.id).join(' or ')}`
    );
  }

  const form = doc.getForm();
  const acroFields = new Map(form.getFields().map((f) => [f.getName(), f]));
  /** Fields whose value the AcroForm itself will render. */
  const handledByForm = new Set();

  // Pass 1 — set values through the form API where the document has a real
  // field, so pdf-lib generates the appearance stream itself.
  for (const field of definition.fields ?? []) {
    const value = values[field.id];
    if (isBlank(value)) continue;
    if (field.kind === 'signature' || field.kind === 'initials') continue;

    const acro = acroFields.get(field.id);
    if (!acro) continue;

    const type = acro.constructor.name;
    try {
      if (type === 'PDFTextField') {
        acro.setText(String(value));
        handledByForm.add(field.id);
      } else if (type === 'PDFCheckBox') {
        if (value === true || value === 'true') acro.check();
        else acro.uncheck();
        handledByForm.add(field.id);
      }
    } catch {
      // Left for pass 2 to draw by hand.
    }
  }

  // Flattening bakes those appearances into the page and drops interactivity,
  // so the signed copy cannot be edited in a reader afterwards.
  //
  // It must happen HERE, between the two passes. flatten() paints every
  // widget's appearance onto the page, so anything drawn before it is covered
  // by the widget that sits on top — an empty box painted over the value.
  try {
    form.flatten();
  } catch {
    // A document with no AcroForm has nothing to flatten.
  }

  // Pass 2 — draw what the form could not represent: images, and any field
  // placed by hand on a document that never had an AcroForm.
  for (const field of definition.fields ?? []) {
    const value = values[field.id];
    const page = pages[field.rect.page];

    if (!page) continue; // definition references a page the document lacks
    if (isBlank(value)) continue;
    if (handledByForm.has(field.id)) continue;

    if (field.kind === 'signature' || field.kind === 'initials') {
      const parsed = parseDataUrl(value);
      if (!parsed) {
        throw new Error(
          `Field "${field.id}" is a ${field.kind} and expects an image data URL, got something else.`
        );
      }
      const image =
        parsed.format === 'png'
          ? await doc.embedPng(parsed.base64)
          : await doc.embedJpg(parsed.base64);
      page.drawImage(image, fitCentred(image.width, image.height, field.rect));
      continue;
    }

    if (field.kind === 'checkbox') {
      // A drawn glyph rather than a form widget, so it survives flattening
      // and renders identically in every reader.
      const size = Math.min(field.rect.width, field.rect.height) * 0.8;
      page.drawText('X', {
        x: field.rect.x + (field.rect.width - size * 0.6) / 2,
        y: field.rect.y + (field.rect.height - size * 0.72) / 2,
        size,
        font: helvetica,
        color: ink,
      });
      continue;
    }

    // Text-ish. Sized to the box, floored so a short field stays legible, and
    // baselined a little above the bottom edge rather than sitting on it.
    const size = Math.max(Math.min(field.rect.height * 0.6, 12), 7);
    page.drawText(String(value), {
      x: field.rect.x + 2,
      y: field.rect.y + (field.rect.height - size) / 2 + 1,
      size,
      font: helvetica,
      color: ink,
      maxWidth: Math.max(field.rect.width - 4, 1),
    });
  }

  return Buffer.from(await doc.save());
}
