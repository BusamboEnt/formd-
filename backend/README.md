# FormD reference backend

A working implementation of the contract in [`openapi.yaml`](./openapi.yaml).

**This is a starting point you deploy and own, not a service we operate.** Your
client records and signed agreements stay in your infrastructure. That is
deliberate: signed agreements are legal documents, and hosting other
organisations' contracts brings POPIA/GDPR obligations, retention policy and
breach liability that are yours to scope, not ours to assume on your behalf.

Any service exposing these routes works. Swap this out whenever you like.

## Routes

| Method | Path                   | Purpose                                        |
| ------ | ---------------------- | ---------------------------------------------- |
| GET    | `/health`              | Liveness probe                                 |
| GET    | `/clients`             | Search — backs `clientSource.searchClients`    |
| GET    | `/clients/:id`         | Fetch one — backs `clientSource.getClientById` |
| POST   | `/agreements`          | Store a signed record — backs `saveHandler`    |
| GET    | `/agreements`          | Retrieve stored records (not used by the widget) |
| POST   | `/forms/import`        | Digitise an uploaded PDF or .docx              |
| GET    | `/forms`               | List imported forms                            |
| GET    | `/forms/:id`           | Fetch one form definition                      |
| GET    | `/forms/:id/document`  | The pinned PDF its fields are positioned against |

Two rules the widget depends on:

- **An empty array from `/clients` means "no such client", never "the lookup
  failed."** Faults must be 5xx. If an outage returns `200 []`, the widget
  cannot tell them apart and shows "no clients matched" during an incident.
- **`/clients/:id` returns 404 for an absent record**, and any other status for
  a fault.

`POST /agreements` rejects a record with no `agreementClauses`, no
`signatureDataUrl` or no `agreementVersion`. A stored record has to show what
was actually agreed to, so one that cannot is refused rather than kept in a
state that looks valid later.

## Importing existing forms

`POST /forms/import` takes a PDF or .docx and returns a form definition whose
fields are positioned on the document.

```bash
curl -F file=@supply-agreement.pdf http://localhost:8080/forms/import
```

How much you get back depends entirely on the source:

| Source | Result |
| --- | --- |
| PDF built as an interactive form (AcroForm) | Every field extracted with the original author's coordinates. Nothing to place by hand. |
| PDF that was never a form | Imports fine, **zero fields**, `origin.note` says so. Fields must be placed manually. |
| `.docx` | Converted to PDF, then as above — a Word file has no field definitions to recover. |

Text fields whose names contain "sign" or "initial" are promoted to signature
and initials fields. It is a heuristic and it can misfire — a field named
`design_notes` contains "sign" — but without it an imported contract offers its
signature line as somewhere to type a name. Correct anything it gets wrong with
`PUT /forms/:id/fields`, below.

## Placing fields by hand

Import only recovers fields a document already had. For everything else —
scans, converted Word files, anything that was only ever meant to be printed —
fields are placed afterwards.

Two ways in. Replace the fields on a form that already exists:

```bash
curl -X PUT http://localhost:8080/forms/$ID/fields \
  -H 'content-type: application/json' \
  -d '{"fields":[
        {"id":"client.name","kind":"text","label":"Client Name",
         "rect":{"page":0,"x":56,"y":652,"width":240,"height":20},"bindTo":"name"},
        {"id":"client.signature","kind":"signature","label":"Client Signature",
         "rect":{"page":0,"x":56,"y":330,"width":240,"height":66}}
      ]}'
```

Or create one from a document and a definition together:

```bash
curl -F file=@scanned-contract.pdf \
     -F 'definition={"title":"Scanned Contract","fields":[...]}' \
     http://localhost:8080/forms
```

**Coordinates are in PDF user space, and the origin is the bottom-left of the
page** — `y` is measured up from the bottom, not down from the top. Getting it
backwards mirrors every field onto the wrong half of the document, which looks
plausible rather than broken. A rectangle off the page, on a page the document
does not have, or sharing an id with another field is rejected with a message
naming the field.

Rather than working those numbers out, draw them. The app serves a designer at
`?form=<id>&design=1` — drag on the rendered page to place a field, click one
to change its type, key, label or client binding, then save. It writes through
the same endpoint.

The document is never replaced by either route. Field coordinates only mean
something against a fixed page, and signed records cite `documentSha256` to
prove which bytes were signed; re-import to change the document. Saving fields
advances the form's version, so two different layouts cannot both claim to be
the version people already signed.

A `.docx` is converted **once**, at import, and that PDF becomes the document of
record. Field coordinates only mean something against a fixed layout, and a Word
file reflows with fonts and page size; re-deriving it later would move the page
under fields already placed on it.

Conversion needs LibreOffice on the server (the Dockerfile installs
`libreoffice-writer`). Without it, `.docx` uploads answer **501** with a message
naming the fix, and PDF uploads are unaffected.

## Run locally

```bash
npm install
npm run seed     # three sample clients, so search returns something
npm start        # listens on :8080
npm test
```

## Deploy to Railway

1. Push this directory to a repo and create a Railway project from it, or use
   the Railway CLI: `railway init && railway up`.
2. **Add a volume mounted at `/data`.** SQLite writes to `DATABASE_PATH`
   (default `/data/formd.db`); without a volume the database is wiped on every
   redeploy.
3. Set `ALLOWED_ORIGINS` to the origins that will embed the widget, e.g.
   `https://app.example.com`. Leaving it unset — or `*` — allows any origin,
   which is fine locally and wrong in production.
4. Railway provides `PORT` automatically. `railway.json` already points the
   healthcheck at `/health`.

### Environment

| Variable          | Default            | Notes                                            |
| ----------------- | ------------------ | ------------------------------------------------ |
| `PORT`            | `8080`             | Set by Railway                                   |
| `DATABASE_PATH`   | `./data/formd.db`  | `/data/formd.db` in the image; needs a volume     |
| `ALLOWED_ORIGINS` | unset (allow all)  | Comma-separated. **Set this in production.**      |

## Connect the widget

Angular:

```ts
import { provideFormd } from './core/config/provide-formd';
import { createHttpClientSource, createHttpSaveHandler }
  from './core/adapters/http-client-source';

provideFormd({
  clientSource: createHttpClientSource({ baseUrl: 'https://your-backend.up.railway.app' }),
  saveHandler:  createHttpSaveHandler({ baseUrl: 'https://your-backend.up.railway.app' }),
});
```

Any other stack, via the custom element:

```html
<formd-wizard id="w"></formd-wizard>
<script src="formd/main.js"></script>
<script>
  const api = 'https://your-backend.up.railway.app';
  const el = document.getElementById('w');
  el.clientSource = FormD.createHttpClientSource({ baseUrl: api });
  el.saveHandler  = FormD.createHttpSaveHandler({ baseUrl: api });
  el.addEventListener('saved', e => console.log('stored', e.detail));
</script>
```

## Storage

SQLite via `better-sqlite3`, so this deploys with no external database. Every
query lives in `src/store.js` behind five methods — moving to Postgres means
reimplementing those and nothing else.

Signed records are stored as JSON in `agreements.payload`, holding the full
agreement text as presented alongside the signature, so a record proves what
was signed rather than pointing at wording that may since have changed.

## Before production

This is a reference, and deliberately omits things your deployment needs:

- **No authentication.** Every route is open. Put your own auth in front of it.
- **No rate limiting.**
- **No encryption at rest** beyond whatever the volume provides.
- **No retention or deletion policy** — relevant under POPIA/GDPR.
- **No audit trail** of who read a stored agreement.
