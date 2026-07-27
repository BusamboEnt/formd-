import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';

let server;
let base;
let store;

const CLIENT = {
  id: '1', name: 'John Doe', address: '12 Main Street', city: 'Johannesburg',
  postalCode: '2000', email: 'john.doe@example.com', phone: '+27 11 000 0001',
  referenceNumber: 'REF-2024-001', companyName: 'Doe Enterprises',
};

const SUBMISSION = {
  client: CLIENT,
  formDate: '26 July 2026',
  agreementTitle: 'SERVICE AGREEMENT',
  agreementVersion: '1.0.0',
  agreementProvider: 'FormD Services (Pty) Ltd',
  agreementClauses: [
    { heading: '1. Services', body: 'The provider delivers the services.' },
    { heading: '2. Payment Terms', body: 'Payable within 30 days of invoice.' },
  ],
  acknowledgement: 'I agree to the terms.',
  signatureDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  savedAt: '2026-07-26T00:00:00.000Z',
};

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

beforeEach(() => {
  store.db.exec('DELETE FROM clients; DELETE FROM agreements;');
  store.upsertClient(CLIENT);
});

const get = (p) => fetch(`${base}${p}`);
const post = (p, body) =>
  fetch(`${base}${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('health', () => {
  test('reports ok', async () => {
    const res = await get('/health');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'ok');
  });
});

describe('GET /clients', () => {
  test('matches on name, case-insensitively', async () => {
    const body = await (await get('/clients?search=john')).json();
    assert.equal(body.length, 1);
    assert.equal(body[0].name, 'John Doe');
  });

  test('matches on reference number', async () => {
    const body = await (await get('/clients?search=REF-2024-001')).json();
    assert.equal(body.length, 1);
  });

  test('matches on company name', async () => {
    const body = await (await get('/clients?search=Doe Enterprises')).json();
    assert.equal(body.length, 1);
  });

  test('returns an empty array when nothing matches', async () => {
    const res = await get('/clients?search=zzzz');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  });

  test('returns everything when no term is given', async () => {
    assert.equal((await (await get('/clients')).json()).length, 1);
  });
});

describe('GET /clients/:id', () => {
  test('returns the client', async () => {
    const body = await (await get('/clients/1')).json();
    assert.equal(body.referenceNumber, 'REF-2024-001');
  });

  // The widget relies on this to tell an absent record apart from a fault.
  test('404s for an unknown id rather than erroring', async () => {
    const res = await get('/clients/nope');
    assert.equal(res.status, 404);
    assert.ok((await res.json()).error);
  });
});

describe('POST /agreements', () => {
  test('stores a complete record', async () => {
    const res = await post('/agreements', SUBMISSION);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.id);
    assert.ok(body.savedAt);
  });

  test('round-trips the full agreement text, not just a reference', async () => {
    await post('/agreements', SUBMISSION);
    const [stored] = await (await get('/agreements')).json();

    assert.equal(stored.agreementVersion, '1.0.0');
    assert.equal(stored.agreementClauses.length, 2);
    assert.equal(stored.agreementClauses[1].heading, '2. Payment Terms');
    assert.match(stored.agreementClauses[1].body, /30 days/);
    assert.equal(stored.signatureDataUrl, SUBMISSION.signatureDataUrl);
  });

  test('filters stored agreements by client', async () => {
    await post('/agreements', SUBMISSION);
    assert.equal((await (await get('/agreements?clientId=1')).json()).length, 1);
    assert.equal((await (await get('/agreements?clientId=other')).json()).length, 0);
  });

  // A record missing its terms cannot show what was agreed to, so it is
  // rejected rather than stored in a state that looks valid later.
  test('rejects a record with no agreement clauses', async () => {
    const res = await post('/agreements', { ...SUBMISSION, agreementClauses: [] });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /agreementClauses/);
  });

  test('rejects a record with no signature', async () => {
    const { signatureDataUrl, ...withoutSignature } = SUBMISSION;
    const res = await post('/agreements', withoutSignature);
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /signatureDataUrl/);
  });

  test('rejects a record with no agreement version', async () => {
    const { agreementVersion, ...withoutVersion } = SUBMISSION;
    const res = await post('/agreements', withoutVersion);
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /agreementVersion/);
  });

  test('rejects a client without an id', async () => {
    const res = await post('/agreements', { ...SUBMISSION, client: { name: 'No Id' } });
    assert.equal(res.status, 400);
  });
});

describe('CORS', () => {
  async function originAllowed(allowed, requestOrigin) {
    const prev = process.env.ALLOWED_ORIGINS;
    if (allowed === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = allowed;

    const s = createApp(new Store(':memory:')).listen(0);
    await new Promise((r) => s.once('listening', r));
    const res = await fetch(`http://127.0.0.1:${s.address().port}/health`, {
      headers: { Origin: requestOrigin },
    });
    const header = res.headers.get('access-control-allow-origin');
    s.close();

    if (prev === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = prev;
    return header;
  }

  // A literal '*' in the list made cors string-match the asterisk against the
  // request origin and reject everything, which looks like a server fault.
  test('ALLOWED_ORIGINS=* allows any origin', async () => {
    assert.ok(await originAllowed('*', 'http://localhost:4300'));
  });

  test('unset ALLOWED_ORIGINS allows any origin', async () => {
    assert.ok(await originAllowed(undefined, 'http://localhost:4300'));
  });

  test('an explicit list allows a listed origin', async () => {
    const header = await originAllowed('http://localhost:4300', 'http://localhost:4300');
    assert.equal(header, 'http://localhost:4300');
  });

  test('an explicit list withholds the header from an unlisted origin', async () => {
    assert.equal(await originAllowed('https://allowed.example', 'http://evil.example'), null);
  });
});

describe('failures surface as 5xx', () => {
  // An outage must never look like an empty client list to the widget.
  test('a store failure returns 500, not an empty result', async () => {
    const broken = {
      searchClients() { throw new Error('database is down'); },
      getClient() { throw new Error('database is down'); },
      saveAgreement() { throw new Error('database is down'); },
      listAgreements() { return []; },
    };
    const s = createApp(broken).listen(0);
    await new Promise((r) => s.once('listening', r));
    const res = await fetch(`http://127.0.0.1:${s.address().port}/clients?search=john`);
    assert.equal(res.status, 500);
    assert.ok((await res.json()).error);
    s.close();
  });
});
