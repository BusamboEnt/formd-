import { it, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';
import { stampPdf } from '../src/import/stamp.js';
import { extractFormDefinition } from '../src/import/extract-pdf.js';
import { inflateSync } from 'node:zlib';

/**
 * Recovers the readable text drawn into a PDF.
 *
 * Two layers hide it from a plain byte search. Content streams are
 * Flate-compressed, and pdf-lib writes the strings themselves as hex —
 * `<535550504C59...> Tj` rather than `(SUPPLY...) Tj` — so both have to be
 * undone before "is the original text still in here?" can be answered.
 */
function inflatedText(pdfBuffer) {
  const raw = pdfBuffer.toString('latin1');
  const chunks = [raw];

  const streams = /stream\r?\n/g;
  let match;
  while ((match = streams.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    try {
      chunks.push(inflateSync(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1'));
    } catch {
      // Not every stream is Flate-encoded — images carry their own codec.
    }
  }

  const joined = chunks.join('\n');
  const decodedHex = joined.replace(/<([0-9A-Fa-f]{4,})>/g, (whole, hex) => {
    if (hex.length % 2) return whole;
    try {
      return Buffer.from(hex, 'hex').toString('latin1');
    } catch {
      return whole;
    }
  });

  return joined + '\n' + decodedHex;
}

let server;
let base;
let store;

const CLIENT = {
  id: '1', name: 'John Doe', address: '12 Main Street', city: 'Johannesburg',
  postalCode: '2000', email: 'john.doe@example.com', phone: '+27 11 000 0001',
  referenceNumber: 'REF-2024-001',
};

/** A 4x2 red PNG — enough to prove an image was placed and how it was scaled. */
const PNG_4x2 =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAF0lEQVQI12P8z4AAT' +
  'AxQBiMDAwMDAwMAADwAAxsBqCcAAAAASUVORK5CYII=';

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

async function formPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('SUPPLY AGREEMENT', { x: 180, y: 780, size: 16, font, color: rgb(0, 0, 0) });
  const form = doc.getForm();
  form.createTextField('client.name').addToPage(page, { x: 160, y: 712, width: 240, height: 20 });
  form.createCheckBox('terms.accepted').addToPage(page, { x: 160, y: 634, width: 16, height: 16 });
  form.createTextField('client.signature').addToPage(page, { x: 160, y: 530, width: 260, height: 60 });
  return Buffer.from(await doc.save());
}

const VALUES = {
  'client.name': 'John Doe',
  'terms.accepted': true,
  'client.signature': PNG_4x2,
};

describe('stampPdf', () => {
  let definition;
  let source;

  before(async () => {
    source = await formPdf();
    definition = await extractFormDefinition(source, { filename: 'supply.pdf' });
  });

  it('returns a valid PDF', async () => {
    const out = await stampPdf(source, definition, VALUES);
    const reloaded = await PDFDocument.load(out);
    assert.equal(reloaded.getPages().length, 1);
  });

  it('preserves the original page geometry', async () => {
    const out = await stampPdf(source, definition, VALUES);
    const page = (await PDFDocument.load(out)).getPages()[0];
    assert.equal(Math.round(page.getWidth()), 595);
    assert.equal(Math.round(page.getHeight()), 842);
  });

  // The whole point of the overlay model: the signed file is the client's
  // document with marks added, not a re-rendering of it. pdf-lib writes
  // compressed streams, so the content has to be inflated before it can be
  // checked — grepping the raw bytes would pass on almost anything.
  it('keeps the original page content', async () => {
    const before = inflatedText(source);
    const after = inflatedText(await stampPdf(source, definition, VALUES));

    assert.ok(before.includes('SUPPLY AGREEMENT'), 'fixture should contain the heading');
    assert.ok(after.includes('SUPPLY AGREEMENT'), 'stamping must not discard original content');
  });

  it('adds the captured values to that content', async () => {
    const after = inflatedText(await stampPdf(source, definition, VALUES));
    assert.ok(after.includes('John Doe'), 'the typed value should be drawn onto the page');
    assert.ok(after.includes('X'), 'the ticked checkbox should be drawn onto the page');
  });

  // Flattening is what stops a signed copy being edited in a reader.
  it('leaves no interactive fields behind', async () => {
    const out = await stampPdf(source, definition, VALUES);
    const reloaded = await PDFDocument.load(out);
    assert.equal(reloaded.getForm().getFields().length, 0);
  });

  it('embeds a signature supplied as a data URL', async () => {
    const withSig = await stampPdf(source, definition, VALUES);
    const withoutSig = await stampPdf(source, definition, {
      'client.name': 'John Doe',
      'terms.accepted': true,
    });
    // The embedded image is extra content in the file.
    assert.ok(withSig.length > withoutSig.length);
  });

  it('rejects a signature field given text instead of an image', async () => {
    await assert.rejects(
      () => stampPdf(source, definition, { ...VALUES, 'client.signature': 'John Doe' }),
      /expects an image data URL/
    );
  });

  it('skips blank optional fields without complaining', async () => {
    await assert.doesNotReject(() => stampPdf(source, definition, {}));
  });

  it('refuses to stamp when a required field is blank', async () => {
    const required = {
      ...definition,
      fields: definition.fields.map((f) =>
        f.id === 'client.name' ? { ...f, required: true } : f
      ),
    };
    await assert.rejects(
      () => stampPdf(source, required, { 'terms.accepted': true }),
      /Missing required field\(s\): client\.name/
    );
  });

  it('ignores a field positioned on a page the document does not have', async () => {
    const offPage = {
      ...definition,
      fields: [{ id: 'ghost', kind: 'text', label: 'Ghost', rect: { page: 9, x: 10, y: 10, width: 50, height: 12 } }],
    };
    await assert.doesNotReject(() => stampPdf(source, offPage, { ghost: 'nowhere' }));
  });
});

describe('POST /forms/:id/sign', () => {
  async function importForm() {
    const body = new FormData();
    body.append('file', new Blob([await formPdf()], { type: 'application/pdf' }), 'supply.pdf');
    return (await fetch(`${base}/forms/import`, { method: 'POST', body })).json();
  }

  const sign = (id, payload) =>
    fetch(`${base}/forms/${id}/sign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

  it('signs an imported form and returns where to fetch the document', async () => {
    const def = await importForm();
    const res = await sign(def.id, { client: CLIENT, values: VALUES });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.id);
    assert.equal(body.documentUrl, `/agreements/${body.id}/document`);
  });

  it('serves back a signed PDF with no editable fields', async () => {
    const def = await importForm();
    const { documentUrl } = await (await sign(def.id, { client: CLIENT, values: VALUES })).json();

    const res = await fetch(`${base}${documentUrl}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');

    const signed = await PDFDocument.load(Buffer.from(await res.arrayBuffer()));
    assert.equal(signed.getForm().getFields().length, 0);
    assert.equal(signed.getPages().length, 1);
  });

  it('records which document version was signed', async () => {
    const def = await importForm();
    await sign(def.id, { client: CLIENT, values: VALUES });

    const [record] = await (await fetch(`${base}/agreements`)).json();
    assert.equal(record.formDefinitionId, def.id);
    assert.equal(record.formVersion, def.version);
    assert.equal(record.documentSha256, def.document.sha256);
    assert.equal(record.values['client.name'], 'John Doe');
  });

  it('404s an unknown form', async () => {
    assert.equal((await sign('nope', { client: CLIENT, values: {} })).status, 404);
  });

  it('400s without a client', async () => {
    const def = await importForm();
    assert.equal((await sign(def.id, { values: VALUES })).status, 400);
  });

  it('400s without values', async () => {
    const def = await importForm();
    assert.equal((await sign(def.id, { client: CLIENT })).status, 400);
  });

  // A bad signature payload is the caller's mistake, not a server fault.
  it('400s, not 500, when a signature field is given text', async () => {
    const def = await importForm();
    const res = await sign(def.id, {
      client: CLIENT,
      values: { ...VALUES, 'client.signature': 'not an image' },
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /image data URL/);
  });

  it('404s a signed document for a record that has none', async () => {
    assert.equal((await fetch(`${base}/agreements/nope/document`)).status, 404);
  });
});
