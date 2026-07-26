import { it, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';
import { extractFormDefinition } from '../src/import/extract-pdf.js';
import { normalizeToPdf, ConversionUnavailableError } from '../src/import/normalize.js';

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

beforeEach(() => store.db.exec('DELETE FROM forms;'));

/** A PDF carrying AcroForm fields, like a business form built in Acrobat. */
async function formPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('SUPPLY AGREEMENT', { x: 180, y: 780, size: 16, font });

  const form = doc.getForm();
  form.createTextField('client.name').addToPage(page, { x: 160, y: 712, width: 240, height: 20 });
  form.createTextField('agreement_date').addToPage(page, { x: 160, y: 672, width: 140, height: 20 });
  form.createCheckBox('terms.accepted').addToPage(page, { x: 160, y: 634, width: 16, height: 16 });
  form.createTextField('client.signature').addToPage(page, { x: 160, y: 530, width: 260, height: 60 });
  form.createTextField('page_initials').addToPage(page, { x: 460, y: 60, width: 60, height: 30 });

  return Buffer.from(await doc.save());
}

/** A plain document — what a converted .docx or a scanned contract looks like. */
async function plainPdf(pageCount = 1) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([595, 842]).drawText(`Page ${i + 1}`, { x: 60, y: 780, size: 12, font });
  }
  return Buffer.from(await doc.save());
}

async function multiPageFormPdf() {
  const doc = await PDFDocument.create();
  const p1 = doc.addPage([595, 842]);
  const p2 = doc.addPage([595, 842]);
  const form = doc.getForm();
  form.createTextField('first.field').addToPage(p1, { x: 50, y: 700, width: 200, height: 20 });
  form.createTextField('second.field').addToPage(p2, { x: 70, y: 400, width: 200, height: 20 });
  return Buffer.from(await doc.save());
}

describe('extractFormDefinition', () => {
  describe('a PDF that already carries field definitions', () => {
    let def;
    before(async () => {
      def = await extractFormDefinition(await formPdf(), { filename: 'supply.pdf' });
    });

    it('reports the fields came from the document itself', () => {
      assert.equal(def.origin.source, 'acroform');
      assert.equal(def.origin.originalFilename, 'supply.pdf');
    });

    it('records page geometry', () => {
      assert.equal(def.document.pages.length, 1);
      assert.equal(Math.round(def.document.pages[0].width), 595);
      assert.equal(Math.round(def.document.pages[0].height), 842);
    });

    it('extracts every field', () => {
      assert.equal(def.fields.length, 5);
    });

    // The coordinates are the original author's, which is the whole point —
    // nothing has to be placed by hand for this class of document.
    it('preserves each field rectangle in PDF user space', () => {
      const name = def.fields.find((f) => f.id === 'client.name');
      assert.equal(name.rect.page, 0);
      assert.equal(Math.round(name.rect.x), 160);
      // y is measured from the bottom of the page, not the top.
      assert.equal(Math.round(name.rect.y), 712);

      // A widget's stored rectangle includes its border, so the size comes
      // back a point or two larger than the box that was requested. Asserting
      // the exact figure would encode pdf-lib's default border width; what
      // matters is that the geometry survives the round trip.
      assert.ok(Math.abs(name.rect.width - 240) <= 2, `width ${name.rect.width}`);
      assert.ok(Math.abs(name.rect.height - 20) <= 2, `height ${name.rect.height}`);
    });

    it('maps a checkbox to the checkbox kind', () => {
      assert.equal(def.fields.find((f) => f.id === 'terms.accepted').kind, 'checkbox');
    });

    it('leaves an ordinary text field as text', () => {
      assert.equal(def.fields.find((f) => f.id === 'agreement_date').kind, 'text');
    });

    // Without this an imported contract offers its signature line as a place
    // to type a name.
    it('promotes a signature-named text field to a signature', () => {
      assert.equal(def.fields.find((f) => f.id === 'client.signature').kind, 'signature');
    });

    it('promotes an initials-named text field to initials', () => {
      assert.equal(def.fields.find((f) => f.id === 'page_initials').kind, 'initials');
    });

    it('humanises field names into labels', () => {
      assert.equal(def.fields.find((f) => f.id === 'client.name').label, 'Client Name');
      assert.equal(def.fields.find((f) => f.id === 'agreement_date').label, 'Agreement Date');
    });
  });

  describe('a document with no field definitions', () => {
    let def;
    before(async () => {
      def = await extractFormDefinition(await plainPdf(), { filename: 'contract.pdf' });
    });

    // Not an error. Most documents were never interactive forms, and the
    // caller needs to be told rather than handed a silent empty result.
    it('imports successfully with no fields', () => {
      assert.equal(def.fields.length, 0);
      assert.equal(def.origin.source, 'converted');
    });

    it('explains why nothing was positioned and what to do', () => {
      assert.match(def.origin.note, /no interactive field definitions/i);
      assert.match(def.origin.note, /by hand/i);
    });
  });

  it('assigns fields to the page they sit on', async () => {
    const def = await extractFormDefinition(await multiPageFormPdf(), { filename: 'two.pdf' });
    assert.equal(def.document.pages.length, 2);
    assert.equal(def.fields.find((f) => f.id === 'first.field').rect.page, 0);
    assert.equal(def.fields.find((f) => f.id === 'second.field').rect.page, 1);
  });

  describe('document fingerprint', () => {
    it('is stable for identical bytes', async () => {
      const pdf = await formPdf();
      const a = await extractFormDefinition(pdf, { filename: 'a.pdf' });
      const b = await extractFormDefinition(pdf, { filename: 'a.pdf' });
      assert.equal(a.document.sha256, b.document.sha256);
      assert.match(a.document.sha256, /^[0-9a-f]{64}$/);
    });

    // A signed record cites this, so a document swapped afterwards is
    // detectable instead of silent.
    it('differs for different documents', async () => {
      const a = await extractFormDefinition(await formPdf(), { filename: 'a.pdf' });
      const b = await extractFormDefinition(await plainPdf(), { filename: 'b.pdf' });
      assert.notEqual(a.document.sha256, b.document.sha256);
    });
  });
});

describe('normalizeToPdf', () => {
  it('passes a PDF through byte for byte', async () => {
    const pdf = await formPdf();
    const out = await normalizeToPdf(pdf, 'already.pdf');
    assert.equal(out.converted, false);
    assert.ok(pdf.equals(out.pdf));
  });

  it('rejects an unsupported extension by name', async () => {
    await assert.rejects(() => normalizeToPdf(Buffer.from('hello'), 'notes.txt'), /Unsupported file type/);
  });

  // LibreOffice is unavailable in this environment, which is exactly the
  // failure an operator hits on a server without it. The requirement is that
  // it names the fix rather than surfacing as a generic crash.
  it('fails a .docx with an actionable message when LibreOffice is unavailable', async () => {
    await assert.rejects(
      () => normalizeToPdf(Buffer.from('PK not really a docx'), 'contract.docx'),
      (err) => {
        assert.ok(err instanceof ConversionUnavailableError);
        assert.match(err.message, /LibreOffice/);
        assert.match(err.message, /apt-get install|upload a PDF/i);
        return true;
      }
    );
  });
});

describe('POST /forms/import', () => {
  async function importFile(buffer, filename, type = 'application/pdf') {
    const body = new FormData();
    body.append('file', new Blob([buffer], { type }), filename);
    return fetch(`${base}/forms/import`, { method: 'POST', body });
  }

  it('digitises a form PDF and stores it', async () => {
    const res = await importFile(await formPdf(), 'supply.pdf');
    assert.equal(res.status, 201);
    const def = await res.json();
    assert.equal(def.fields.length, 5);
    assert.equal(def.origin.source, 'acroform');
    assert.equal(def.document.url, `/forms/${def.id}/document`);
  });

  it('serves back the exact bytes the fields were positioned against', async () => {
    const pdf = await formPdf();
    const def = await (await importFile(pdf, 'supply.pdf')).json();

    const res = await fetch(`${base}${def.document.url}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.ok(pdf.equals(Buffer.from(await res.arrayBuffer())));
  });

  it('lists and fetches an imported form', async () => {
    const def = await (await importFile(await formPdf(), 'supply.pdf')).json();
    assert.equal((await (await fetch(`${base}/forms`)).json()).length, 1);
    assert.equal((await (await fetch(`${base}/forms/${def.id}`)).json()).id, def.id);
  });

  it('404s for an unknown form', async () => {
    assert.equal((await fetch(`${base}/forms/nope`)).status, 404);
    assert.equal((await fetch(`${base}/forms/nope/document`)).status, 404);
  });

  it('400s when no file was sent', async () => {
    const res = await fetch(`${base}/forms/import`, { method: 'POST', body: new FormData() });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /No file uploaded/);
  });

  it('400s for an unsupported extension', async () => {
    const res = await importFile(Buffer.from('hello'), 'notes.txt', 'text/plain');
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Unsupported file type/);
  });

  // 501, not 500: the request is fine, the deployment cannot serve it.
  it('501s a .docx when conversion is unavailable, naming the fix', async () => {
    const res = await importFile(
      Buffer.from('PK'),
      'contract.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    assert.equal(res.status, 501);
    assert.match((await res.json()).error, /LibreOffice/);
  });
});
