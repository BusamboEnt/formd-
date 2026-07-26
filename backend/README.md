# FormD reference backend

A working implementation of the contract in [`openapi.yaml`](./openapi.yaml).

**This is a starting point you deploy and own, not a service we operate.** Your
client records and signed agreements stay in your infrastructure. That is
deliberate: signed agreements are legal documents, and hosting other
organisations' contracts brings POPIA/GDPR obligations, retention policy and
breach liability that are yours to scope, not ours to assume on your behalf.

Any service exposing these routes works. Swap this out whenever you like.

## Routes

| Method | Path             | Purpose                                        |
| ------ | ---------------- | ---------------------------------------------- |
| GET    | `/health`        | Liveness probe                                 |
| GET    | `/clients`       | Search — backs `clientSource.searchClients`    |
| GET    | `/clients/:id`   | Fetch one — backs `clientSource.getClientById` |
| POST   | `/agreements`    | Store a signed record — backs `saveHandler`    |
| GET    | `/agreements`    | Retrieve stored records (not used by the widget) |

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
