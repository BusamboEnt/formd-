/**
 * Renders a signed PDF so it can be looked at.
 *
 * This exists because the unit suite cannot catch the class of bug it was
 * written for. Stamping once drew every value onto the page and *then*
 * flattened the form, which paints each widget's empty appearance on top —
 * the values were present in the file, and invisible on the page. Every
 * assertion passed. Only rendering the result showed blank fields.
 *
 *   node scripts/verify-signing.mjs [http://localhost:8080]
 *
 * Requires playwright and a running backend. Writes:
 *   /tmp/formd-verify/source.pdf   the unsigned agreement
 *   /tmp/formd-verify/signed.pdf   the same document, signed
 *   /tmp/formd-verify/signed.png   what it actually looks like
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const API = process.argv[2] ?? 'http://localhost:8080';
const OUT = '/tmp/formd-verify';
const CHROME = process.env.CHROME_BIN ?? '/opt/pw-browsers/chromium';

mkdirSync(OUT, { recursive: true });

async function buildAgreement() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const grey = rgb(0.35, 0.35, 0.38);

  page.drawText('ACME TRADING CO', { x: 56, y: 792, size: 13, font: bold });
  page.drawLine({ start: { x: 56, y: 782 }, end: { x: 539, y: 782 }, thickness: 1, color: grey });
  page.drawText('SUPPLY AGREEMENT', { x: 56, y: 742, size: 20, font: bold });
  page.drawText('Client name', { x: 56, y: 676, size: 10, font: bold });
  page.drawText('Reference', { x: 320, y: 676, size: 10, font: bold });
  page.drawText('I accept the terms above', { x: 82, y: 452, size: 10, font: helv });
  page.drawText('Client signature', { x: 56, y: 404, size: 10, font: bold });
  page.drawText('Date', { x: 320, y: 404, size: 10, font: bold });

  const form = doc.getForm();
  form.createTextField('client.name').addToPage(page, { x: 56, y: 652, width: 240, height: 20 });
  form.createTextField('client.reference').addToPage(page, { x: 320, y: 652, width: 200, height: 20 });
  form.createCheckBox('terms.accepted').addToPage(page, { x: 56, y: 448, width: 16, height: 16 });
  form.createTextField('client.signature').addToPage(page, { x: 56, y: 330, width: 240, height: 66 });
  form.createTextField('signed.date').addToPage(page, { x: 320, y: 330, width: 200, height: 22 });

  return Buffer.from(await doc.save());
}

const source = await buildAgreement();
writeFileSync(`${OUT}/source.pdf`, source);

const body = new FormData();
body.append('file', new Blob([source], { type: 'application/pdf' }), 'acme-agreement.pdf');
const definition = await (await fetch(`${API}/forms/import`, { method: 'POST', body })).json();
console.log(
  `imported: ${definition.origin.source}, ${definition.fields.length} fields ` +
    `(${definition.fields.map((f) => `${f.id}:${f.kind}`).join(', ')})`
);

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();

const signature = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 132;
  const x = c.getContext('2d');
  x.strokeStyle = '#111';
  x.lineWidth = 3;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(24, 92);
  for (const [px, py] of [[60,40],[92,96],[128,36],[168,92],[206,44],[250,88],[292,40],[338,86],[386,46],[430,80]]) {
    x.quadraticCurveTo(px - 14, py - 18, px, py);
  }
  x.stroke();
  return c.toDataURL('image/png');
});

const signed = await (
  await fetch(`${API}/forms/${definition.id}/sign`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client: { id: '1', name: 'John Doe', referenceNumber: 'ACME-2026-014' },
      values: {
        'client.name': 'John Doe',
        'client.reference': 'ACME-2026-014',
        'terms.accepted': true,
        'client.signature': signature,
        'signed.date': '26 July 2026',
      },
    }),
  })
).json();

if (!signed.documentUrl) {
  console.error('signing failed:', signed);
  await browser.close();
  process.exit(1);
}

const pdf = Buffer.from(await (await fetch(`${API}${signed.documentUrl}`)).arrayBuffer());
writeFileSync(`${OUT}/signed.pdf`, pdf);

const reloaded = await PDFDocument.load(pdf);
console.log(
  `signed: ${pdf.length} bytes, ${reloaded.getPages().length} page(s), ` +
    `${reloaded.getForm().getFields().length} editable fields remaining`
);

await page.goto(`file://${OUT}/signed.pdf`);
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/signed.png` });
await browser.close();

console.log(`\nOpen ${OUT}/signed.png and check every field carries its value.`);
console.log('Blank boxes mean values are being painted over — see the note at the top of this file.');
