/**
 * Assembles the element build into ONE self-contained HTML file.
 *
 * Why this exists: FormD's normal output is a set of files served over HTTP,
 * with a backend behind it. Neither is available where a single page has to
 * stand on its own — a published artifact, an offline demo handed to a client,
 * a page opened straight off disk. This produces a build that has no network
 * dependencies at all.
 *
 * What it has to solve:
 *
 *   Lazy chunks   webpack loads them by injecting <script src="605.js">, and
 *                 there is no 605.js next to a single file. But each chunk is
 *                 a plain script that pushes onto self.webpackChunkformd_app,
 *                 and the runtime processes anything already in that array on
 *                 startup. So inlining the chunks as ordinary scripts *before*
 *                 the runtime module registers them as pre-installed, and the
 *                 dynamic imports resolve without a single request.
 *
 *   pdf.js worker Normally fetched from assets/. Inlined as a blob URL and
 *                 handed to the app through window.FormD.pdfWorkerSrc.
 *
 *   The backend   Replaced by a fetch shim. Signing is real — the same pdf-lib
 *                 stamping the server does, bundled to run in the browser — so
 *                 the signed PDF this produces is the genuine article, not a
 *                 mock-up of one.
 *
 *   Fonts         Rewritten to data URIs; a woff2 request would 404.
 *
 * Usage:  node scripts/build-artifact.mjs [outfile]
 * Expects `ng run formd-app:build-element` to have run first.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist/formd-element');
const OUT = process.argv[2] ?? join(ROOT, 'dist/formd-artifact.html');

if (!existsSync(join(DIST, 'main.js'))) {
  console.error('dist/formd-element is missing. Run: npx ng run formd-app:build-element');
  process.exit(1);
}

const read = (f) => readFileSync(join(DIST, f), 'utf8');
const b64 = (f) => readFileSync(join(DIST, f)).toString('base64');

/* ------------------------------------------------------------------ fonts */

let styles = read('styles.css');
for (const font of ['inter-var.woff2', 'material-icons.woff2']) {
  if (!existsSync(join(DIST, font))) continue;
  const dataUri = `data:font/woff2;base64,${b64(font)}`;
  // The stylesheet references these both bare and under assets/fonts/.
  styles = styles.split(`assets/fonts/${font}`).join(dataUri).split(font).join(dataUri);
}

/* ------------------------------------------------- the document being signed */

// Built and read back through the real extractor, so the field rectangles in
// the demo are the ones the import engine actually produces rather than
// numbers typed in by hand.
const { PDFDocument, StandardFonts, rgb } = await import(
  join(ROOT, 'backend/node_modules/pdf-lib/cjs/index.js')
);
const { extractFormDefinition } = await import(join(ROOT, 'backend/src/import/extract-pdf.js'));

async function buildAgreementPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const grey = rgb(0.35, 0.35, 0.38);

  page.drawText('ACME TRADING CO', { x: 56, y: 792, size: 13, font: bold });
  page.drawLine({ start: { x: 56, y: 782 }, end: { x: 539, y: 782 }, thickness: 1, color: grey });
  page.drawText('SUPPLY AGREEMENT', { x: 56, y: 742, size: 20, font: bold });
  page.drawText('Between Acme Trading Co ("Supplier") and the Client named below.', {
    x: 56, y: 720, size: 10, font: helv, color: grey,
  });

  page.drawText('Client name', { x: 56, y: 676, size: 10, font: bold });
  page.drawText('Reference', { x: 320, y: 676, size: 10, font: bold });

  let y = 600;
  for (const [heading, body] of [
    ['1.  Goods', 'Acme supplies the goods listed in the order schedule attached to this agreement.'],
    ['2.  Delivery', 'Delivery occurs within 14 days of order confirmation.'],
    ['3.  Payment', 'Payable within 30 days of invoice. Late payment attracts 2% per month.'],
  ]) {
    page.drawText(heading, { x: 56, y, size: 11, font: bold });
    page.drawText(body, { x: 56, y: y - 16, size: 10, font: helv });
    y -= 52;
  }

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

const sourcePdf = await buildAgreementPdf();
const definition = await extractFormDefinition(sourcePdf, {
  filename: 'acme-supply-agreement.pdf',
  id: 'demo-supply-agreement',
});

// A data URI rather than a shimmed request: pdf.js fetches the document
// through its own network layer, which window.fetch does not intercept.
definition.document.url = `data:application/pdf;base64,${sourcePdf.toString('base64')}`;

// Two fields prefill from the selected client, which is what `bindTo` is for.
for (const field of definition.fields) {
  if (field.id === 'client.name') field.bindTo = 'name';
  if (field.id === 'client.reference') field.bindTo = 'referenceNumber';
}

/* --------------------------------------------------- browser-side stamping */

// The server's stamping module, bundled for the browser. Buffer is shimmed
// because stamp.js ends with Buffer.from(await doc.save()) — the only Node
// API it touches.
const stampEntry = join(ROOT, 'scripts/.artifact-stamp-entry.mjs');
writeFileSync(
  stampEntry,
  `import { stampPdf } from '${join(ROOT, 'backend/src/import/stamp.js').replace(/\\/g, '/')}';\n` +
    'window.FormDStamp = stampPdf;\n'
);
const stampBundle = execFileSync(
  join(ROOT, 'node_modules/.bin/esbuild'),
  [
    stampEntry,
    '--bundle',
    '--format=iife',
    '--minify',
    '--platform=browser',
    `--banner:js=globalThis.Buffer=globalThis.Buffer||{from:(v)=>v instanceof Uint8Array?v:new Uint8Array(v)};`,
  ],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
).toString();
execFileSync('rm', ['-f', stampEntry]);

/* ------------------------------------------------------------------- html */

const chunks = ['8.js', '239.js', '605.js', '636.js'].filter((f) => existsSync(join(DIST, f)));
const workerB64 = existsSync(join(DIST, 'assets/pdf.worker.min.mjs'))
  ? readFileSync(join(DIST, 'assets/pdf.worker.min.mjs')).toString('base64')
  : '';

const html = `<title>FormD — sign a document</title>
<style>
${styles}

/* The page commits to FormD's light ground rather than offering a dark theme.
   The subject is a paper contract: the PDF canvas renders white, the signed
   artifact is white, and a dark chrome wrapped around a white page reads as
   a viewer, not as the product. color-scheme pins form controls to match so a
   viewer in dark mode does not get dark-rendered inputs on a white document. */
:root { color-scheme: light; }

.demo-bar {
  display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap;
  padding: 14px 24px; border-bottom: 1px solid var(--border);
  background: var(--background);
  position: sticky; top: 0; z-index: 20;
}
.demo-brand { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; }
.demo-brand span { font-weight: 400; color: var(--muted-foreground); margin-left: 8px; }
.demo-tabs { display: flex; gap: 6px; margin-left: auto; }
.demo-tab {
  font: inherit; font-size: 13px; padding: 7px 13px; cursor: pointer;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--background); color: var(--muted-foreground);
  transition: background .12s ease, color .12s ease;
}
.demo-tab:hover { background: var(--muted); color: var(--foreground); }
.demo-tab:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.demo-tab[aria-selected=true] {
  background: var(--primary); color: var(--primary-foreground); border-color: var(--primary);
}

.demo-note {
  padding: 14px 24px; border-bottom: 1px solid var(--border); background: var(--muted);
  font-size: 13px; line-height: 1.55; color: var(--muted-foreground);
  margin: 0;
}
/* Numbered because signing genuinely is ordered — you cannot save before you
   sign, which is the rule this build exists to demonstrate. */
.demo-steps {
  display: flex; gap: 22px; flex-wrap: wrap; margin: 8px 0 0; padding: 0; list-style: none;
  counter-reset: step;
}
.demo-steps li { counter-increment: step; position: relative; padding-left: 22px; }
.demo-steps li::before {
  content: counter(step); position: absolute; left: 0; top: 1px;
  width: 15px; height: 15px; border-radius: 50%;
  background: var(--primary); color: var(--primary-foreground);
  font-size: 10px; font-weight: 600; display: grid; place-items: center;
}
.demo-note code {
  background: rgba(0,0,0,.06); padding: 1px 5px; border-radius: 4px;
  font-size: 12px;
}
@media (prefers-reduced-motion: reduce) { .demo-tab { transition: none; } }
</style>

<div class="demo-bar">
  <div class="demo-brand">FormD<span>pre-filled contracts, signed in place</span></div>
  <div class="demo-tabs">
    <button class="demo-tab" id="tab-doc" aria-selected="true">Imported document</button>
    <button class="demo-tab" id="tab-clause" aria-selected="false">Clause agreement</button>
  </div>
</div>
<div class="demo-note" id="note"></div>

<formd-wizard id="wizard"></formd-wizard>

<script>
/* pdf.js fetches its worker by URL. There is no URL here, so it is inlined
   and handed over as a blob. If the browser refuses a module worker from a
   blob, pdf.js falls back to running on the main thread and still renders. */
window.FormD = window.FormD || {};
${
  workerB64
    ? `try {
  const src = Uint8Array.from(atob("${workerB64}"), c => c.charCodeAt(0));
  window.FormD.pdfWorkerSrc = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
} catch (e) { console.warn('FormD: inline pdf worker unavailable, using main thread', e); }`
    : ''
}
</script>

<script>${stampBundle}</script>

<script>
/* Stands in for the backend. Only the two calls the document flow makes are
   served; the signing one does the real pdf-lib stamping, so what comes out
   is a genuinely flattened PDF and not a picture of one. */
(function () {
  const DEFINITION = ${JSON.stringify(definition)};
  const realFetch = window.fetch.bind(window);

  function pdfBytes() {
    const b64 = DEFINITION.document.url.split(',')[1];
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  }

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input && input.url;
    if (typeof url !== 'string') return realFetch(input, init);

    if (/\\/forms\\/[^/]+$/.test(url)) {
      return new Response(JSON.stringify(DEFINITION), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }

    if (/\\/forms\\/[^/]+\\/sign$/.test(url)) {
      try {
        const { values } = JSON.parse(init.body);
        const signed = await window.FormDStamp(pdfBytes(), DEFINITION, values);
        const blob = new Blob([signed], { type: 'application/pdf' });
        return new Response(
          JSON.stringify({ documentUrl: URL.createObjectURL(blob) }),
          { status: 201, headers: { 'content-type': 'application/json' } }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err.message || err) }), {
          status: 400, headers: { 'content-type': 'application/json' },
        });
      }
    }

    return realFetch(input, init);
  };
})();
</script>

${chunks.map((f) => `<script>${read(f)}</script>`).join('\n')}
<script type="module">${read('runtime.js')}</script>
<script type="module">${read('polyfills.js')}</script>
<script type="module">${read('main.js')}</script>

<script type="module">
const CLIENTS = [
  { id: 'a1', name: 'Ada Lovelace', companyName: 'Analytical Engines Ltd',
    address: '1 Analytical Way', city: 'London', postalCode: 'EC1A 1AA',
    email: 'ada@example.com', phone: '+44 20 0000 0001', referenceNumber: 'ACME-001' },
  { id: 'g1', name: 'Grace Hopper', companyName: 'Compiler Works',
    address: '9 Nanosecond Road', city: 'Arlington', postalCode: '22201',
    email: 'grace@example.com', phone: '+1 703 000 0002', referenceNumber: 'ACME-002' },
  { id: 'k1', name: 'Katherine Johnson', companyName: 'Orbital Mechanics Inc',
    address: '3 Trajectory Lane', city: 'Hampton', postalCode: '23666',
    email: 'katherine@example.com', phone: '+1 757 000 0003', referenceNumber: 'ACME-003' },
];

const NOTES = {
  doc:
    'Your own PDF, rendered as it is, with fields placed on top. The original document is what ' +
    'gets signed — nothing is re-typeset. Signing flattens the marks into the page, so the ' +
    'result cannot be edited in a PDF reader afterwards.' +
    '<ul class="demo-steps">' +
      '<li>Type into the name, reference and date boxes</li>' +
      '<li>Click the <code>Sign</code> box and draw</li>' +
      '<li><code>Sign &amp; Save</code>, then open the signed PDF</li>' +
    '</ul>',
  clause:
    'The other flow: a contract built from clauses supplied as JSON, with client lookup, ' +
    'signature capture, and a record saved as a PNG image plus a JSON file. Search for ' +
    '<code>Ada</code>, <code>Grace</code> or <code>Katherine</code> to begin.',
};

await customElements.whenDefined('formd-wizard');
const el = document.getElementById('wizard');
const note = document.getElementById('note');
const tabs = { doc: document.getElementById('tab-doc'), clause: document.getElementById('tab-clause') };

el.clientSource = {
  searchClients: (q) => CLIENTS.filter((c) =>
    (c.name + ' ' + c.referenceNumber + ' ' + c.companyName).toLowerCase().includes(q.toLowerCase())),
  getClientById: (id) => CLIENTS.find((c) => c.id === id),
};
el.saveHandler = { save: () => 'saved' };
el.branding = { name: 'ACME', tagline: 'Supply Contracts' };
el.agreement = {
  title: 'SUPPLY AGREEMENT',
  version: '2.1.0',
  provider: 'Acme Trading Co',
  clauses: [
    { heading: '1. Goods', body: 'Acme supplies the goods listed in the order schedule attached to this agreement.' },
    { heading: '2. Delivery', body: 'Delivery occurs within 14 days of order confirmation. Risk passes on delivery.' },
    { heading: '3. Payment', body: 'Payable within 30 days of invoice. Late payment attracts interest at 2% per month.' },
    { heading: '4. Termination', body: 'Either party may terminate on 30 days written notice.' },
  ],
  acknowledgement: 'I confirm I have read and accept the supply terms set out above.',
};

function show(mode) {
  for (const [k, b] of Object.entries(tabs)) b.setAttribute('aria-selected', String(k === mode));
  note.innerHTML = NOTES[mode];
  // apiBaseUrl stays empty so the signed-document link is used verbatim —
  // it is a blob URL, and prefixing it with a host would break it.
  el.apiBaseUrl = '';
  el.formId = mode === 'doc' ? ${JSON.stringify(definition.id)} : undefined;
}

tabs.doc.addEventListener('click', () => show('doc'));
tabs.clause.addEventListener('click', () => show('clause'));
show('doc');
</script>
`;

writeFileSync(OUT, html);
console.log(`${OUT}  ${(html.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`chunks inlined: ${chunks.join(', ')}`);
console.log(`pdf worker: ${workerB64 ? 'inlined' : 'MISSING — will fall back to main thread'}`);
