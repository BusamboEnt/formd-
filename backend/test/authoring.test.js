import { it, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';
import { validateFields, bumpMinor } from '../src/import/validate-definition.js';

/**
 * The authoring path: placing fields on a document that arrived without any.
 *
 * Before this existed, /forms/import was the only way a form could enter the
 * system, and it only recovers fields from a PDF that was already an
 * interactive form. Everything else — a scan, a converted Word file — imported
 * with zero fields and an origin.note saying they had to be placed by hand,
 * and there was no route that accepted them. The note described work that was
 * impossible to do.
 */

let server;
let base;
let store;

before(async () => {
  store = new Store(':memory:');
  server = createApp(store).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  store.close();
});

beforeEach(() => store.db.exec('DELETE FROM forms; DELETE FROM agreements;'));

/** A document that was never a form — the case with nothing to extract. */
async function plainPdf(pageCount = 1) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([595, 842]).drawText(`Page ${i + 1}`, { x: 60, y: 780, size: 12, font });
  }
  return Buffer.from(await doc.save());
}

const FIELDS = [
  { id: 'client.name', kind: 'text', label: 'Client Name',
    rect: { page: 0, x: 56, y: 652, width: 240, height: 20 } },
  { id: 'client.signature', kind: 'signature', label: 'Client Signature',
    rect: { page: 0, x: 56, y: 330, width: 240, height: 66 } },
];

async function postForm(definition, pdf) {
  const body = new FormData();
  body.append('file', new Blob([pdf ?? (await plainPdf())], { type: 'application/pdf' }), 'scan.pdf');
  body.append('definition', JSON.stringify(definition));
  const res = await fetch(`${base}/forms`, { method: 'POST', body });
  return { res, json: await res.json() };
}

describe('POST /forms', () => {
  it('creates a signable form from hand-placed fields', async () => {
    const { res, json } = await postForm({ title: 'Scanned Contract', fields: FIELDS });
    assert.equal(res.status, 201);
    assert.equal(json.title, 'Scanned Contract');
    assert.equal(json.fields.length, 2);
    assert.equal(json.origin.source, 'authored');
  });

  it('measures the document itself rather than trusting the caller', async () => {
    // A caller claiming a huge page would otherwise slip an off-page field
    // past the bounds check.
    const { json } = await postForm({
      title: 'Scanned Contract',
      fields: FIELDS,
      document: { pages: [{ width: 9999, height: 9999 }], sha256: 'not-the-real-one' },
    });
    assert.deepEqual(json.document.pages, [{ width: 595, height: 842 }]);
    assert.match(json.document.sha256, /^[0-9a-f]{64}$/);
  });

  it('serves the document back so fields can be positioned against it', async () => {
    const { json } = await postForm({ title: 'Scanned Contract', fields: FIELDS });
    const doc = await fetch(`${base}${json.document.url}`);
    assert.equal(doc.status, 200);
    assert.equal(doc.headers.get('content-type'), 'application/pdf');
  });

  it('rejects a field placed off the page', async () => {
    const { res, json } = await postForm({
      title: 'Bad',
      fields: [{ ...FIELDS[0], rect: { page: 0, x: 56, y: 900, width: 240, height: 20 } }],
    });
    assert.equal(res.status, 400);
    assert.match(json.error, /extends past the page/);
    // The message has to name the convention, because measuring y from the
    // top is the mistake it is most often catching.
    assert.match(json.error, /BOTTOM-left/);
  });

  it('rejects a field on a page the document does not have', async () => {
    const { res, json } = await postForm({
      title: 'Bad',
      fields: [{ ...FIELDS[0], rect: { ...FIELDS[0].rect, page: 3 } }],
    });
    assert.equal(res.status, 400);
    assert.match(json.error, /has 1 page\(s\)/);
  });

  it('rejects two fields sharing an id', async () => {
    const { res, json } = await postForm({
      title: 'Bad',
      fields: [FIELDS[0], { ...FIELDS[0], label: 'Duplicate' }],
    });
    assert.equal(res.status, 400);
    assert.match(json.error, /used more than once/);
  });

  it('rejects an unknown field kind', async () => {
    const { res, json } = await postForm({
      title: 'Bad',
      fields: [{ ...FIELDS[0], kind: 'sparkle' }],
    });
    assert.equal(res.status, 400);
    assert.match(json.error, /kind must be one of/);
  });

  it('requires a title', async () => {
    const { res, json } = await postForm({ fields: FIELDS });
    assert.equal(res.status, 400);
    assert.match(json.error, /title is required/);
  });

  it('requires the document', async () => {
    const body = new FormData();
    body.append('definition', JSON.stringify({ title: 'No file', fields: [] }));
    const res = await fetch(`${base}/forms`, { method: 'POST', body });
    assert.equal(res.status, 400);
  });
});

describe('PUT /forms/:id/fields', () => {
  /** Imports a document with nothing on it, the state this route exists for. */
  async function importBlank(pageCount = 1) {
    const body = new FormData();
    body.append('file', new Blob([await plainPdf(pageCount)], { type: 'application/pdf' }), 'scan.pdf');
    return (await fetch(`${base}/forms/import`, { method: 'POST', body })).json();
  }

  async function putFields(id, payload) {
    const res = await fetch(`${base}/forms/${id}/fields`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { res, json: await res.json() };
  }

  it('makes a document that imported with no fields signable', async () => {
    const imported = await importBlank();
    assert.equal(imported.fields.length, 0, 'a plain PDF should import with nothing on it');

    const { res, json } = await putFields(imported.id, { fields: FIELDS });
    assert.equal(res.status, 200);
    assert.equal(json.fields.length, 2);

    const reloaded = await (await fetch(`${base}/forms/${imported.id}`)).json();
    assert.equal(reloaded.fields.length, 2);
  });

  it('bumps the version, so signed records cannot claim the wrong layout', async () => {
    const imported = await importBlank();
    assert.equal(imported.version, '1.0.0');
    const { json } = await putFields(imported.id, { fields: FIELDS });
    assert.equal(json.version, '1.1.0');
  });

  it('accepts an explicit version instead', async () => {
    const imported = await importBlank();
    const { json } = await putFields(imported.id, { fields: FIELDS, version: '2.0.0' });
    assert.equal(json.version, '2.0.0');
  });

  it('leaves the document untouched', async () => {
    const imported = await importBlank();
    const before = await (await fetch(`${base}${imported.document.url}`)).arrayBuffer();
    await putFields(imported.id, { fields: FIELDS });
    const after = await (await fetch(`${base}${imported.document.url}`)).arrayBuffer();

    assert.deepEqual(Buffer.from(after), Buffer.from(before));
    const reloaded = await (await fetch(`${base}/forms/${imported.id}`)).json();
    assert.equal(reloaded.document.sha256, imported.document.sha256);
  });

  // The "sign" heuristic promotes any field whose name contains it, so
  // design_notes arrives as a signature box. The README says to correct it;
  // this is what makes that possible.
  it('corrects a field the import heuristic misread', async () => {
    const body = new FormData();
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    doc.getForm().createTextField('design_notes')
      .addToPage(page, { x: 56, y: 600, width: 240, height: 20 });
    body.append('file', new Blob([Buffer.from(await doc.save())], { type: 'application/pdf' }), 'f.pdf');
    const imported = await (await fetch(`${base}/forms/import`, { method: 'POST', body })).json();
    assert.equal(imported.fields[0].kind, 'signature', 'heuristic should misfire here');

    const corrected = imported.fields.map((f) => ({ ...f, kind: 'multiline' }));
    const { json } = await putFields(imported.id, { fields: corrected });
    assert.equal(json.fields[0].kind, 'multiline');
  });

  it('allows clearing every field to start over', async () => {
    const imported = await importBlank();
    await putFields(imported.id, { fields: FIELDS });
    const { res, json } = await putFields(imported.id, { fields: [] });
    assert.equal(res.status, 200);
    assert.equal(json.fields.length, 0);
  });

  it('404s for a form that does not exist', async () => {
    const { res } = await putFields('nope', { fields: [] });
    assert.equal(res.status, 404);
  });

  it('rejects fields that are not an array', async () => {
    const imported = await importBlank();
    const { res, json } = await putFields(imported.id, { fields: { id: 'x' } });
    assert.equal(res.status, 400);
    assert.match(json.error, /must be an array/);
  });

  it('validates against the real page count of a multi-page document', async () => {
    const imported = await importBlank(3);
    const ok = await putFields(imported.id, {
      fields: [{ ...FIELDS[0], rect: { ...FIELDS[0].rect, page: 2 } }],
    });
    assert.equal(ok.res.status, 200);

    const tooFar = await putFields(imported.id, {
      fields: [{ ...FIELDS[0], rect: { ...FIELDS[0].rect, page: 3 } }],
    });
    assert.equal(tooFar.res.status, 400);
  });
});

describe('validateFields', () => {
  const pages = [{ width: 595, height: 842 }];

  it('accepts a field flush against the page edge', () => {
    // A widget rectangle includes its border, so a field drawn to the edge
    // measures fractionally larger than the page.
    assert.equal(
      validateFields([{ ...FIELDS[0], rect: { page: 0, x: 0, y: 0, width: 595.4, height: 20 } }], pages),
      null
    );
  });

  it('rejects a zero-height field', () => {
    assert.match(
      validateFields([{ ...FIELDS[0], rect: { page: 0, x: 10, y: 10, width: 100, height: 0 } }], pages),
      /positive width and height/
    );
  });

  it('rejects a non-numeric coordinate', () => {
    assert.match(
      validateFields([{ ...FIELDS[0], rect: { page: 0, x: '56', y: 10, width: 100, height: 20 } }], pages),
      /rect\.x must be a finite number/
    );
  });

  it('names the offending field by index', () => {
    assert.match(
      validateFields([FIELDS[0], { ...FIELDS[1], kind: 'nope' }], pages),
      /fields\[1\]\.kind/
    );
  });
});

describe('bumpMinor', () => {
  it('advances the minor version and resets the patch', () => {
    assert.equal(bumpMinor('1.0.0'), '1.1.0');
    assert.equal(bumpMinor('2.9.4'), '2.10.0');
  });

  it('leaves a version it does not understand alone', () => {
    assert.equal(bumpMinor('draft'), 'draft');
    assert.equal(bumpMinor(undefined), undefined);
  });
});
