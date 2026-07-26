import { createHttpClientSource, createHttpSaveHandler } from './http-client-source';
import { Client } from '../models/client.model';
import { FormSubmission } from '../models/form-submission.model';

const CLIENT: Client = {
  id: '1', name: 'John Doe', address: '12 Main Street', city: 'Johannesburg',
  postalCode: '2000', email: 'john.doe@example.com', phone: '+27 11 000 0001',
  referenceNumber: 'REF-2024-001',
};

const SUBMISSION = {
  client: CLIENT,
  formDate: '26 July 2026',
  agreementTitle: 'SERVICE AGREEMENT',
  agreementVersion: '1.0.0',
  agreementProvider: 'FormD Services (Pty) Ltd',
  agreementClauses: [{ heading: '1. Services', body: 'Services are delivered.' }],
  acknowledgement: 'I agree.',
  signatureDataUrl: 'data:image/png;base64,AAAA',
  savedAt: '2026-07-26T00:00:00.000Z',
} as FormSubmission;

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createHttpClientSource', () => {
  let fetchSpy: jasmine.Spy;

  beforeEach(() => {
    fetchSpy = spyOn(window, 'fetch');
  });

  it('calls the search endpoint with an encoded term', async () => {
    fetchSpy.and.resolveTo(respond([CLIENT]));
    await createHttpClientSource({ baseUrl: 'https://api.test' }).searchClients('john doe');

    expect(fetchSpy.calls.mostRecent().args[0])
      .toBe('https://api.test/clients?search=john%20doe');
  });

  it('tolerates a trailing slash on the base URL', async () => {
    fetchSpy.and.resolveTo(respond([]));
    await createHttpClientSource({ baseUrl: 'https://api.test/' }).searchClients('x');

    expect(fetchSpy.calls.mostRecent().args[0]).toBe('https://api.test/clients?search=x');
  });

  it('returns the records the backend sent', async () => {
    fetchSpy.and.resolveTo(respond([CLIENT]));
    const out = await createHttpClientSource({ baseUrl: 'https://api.test' }).searchClients('john');
    expect(out).toEqual([CLIENT]);
  });

  it('sends supplied headers', async () => {
    fetchSpy.and.resolveTo(respond([]));
    await createHttpClientSource({
      baseUrl: 'https://api.test',
      headers: { Authorization: 'Bearer t0ken' },
    }).searchClients('x');

    expect(fetchSpy.calls.mostRecent().args[1].headers['Authorization']).toBe('Bearer t0ken');
  });

  // Flattening a 500 into [] here would recreate the production defect the
  // widget was fixed for: an outage rendering as "no clients matched".
  it('throws on a server error rather than returning no results', async () => {
    fetchSpy.and.resolveTo(respond({ error: 'boom' }, 500));
    await expectAsync(
      Promise.resolve(createHttpClientSource({ baseUrl: 'https://api.test' }).searchClients('john'))
    ).toBeRejectedWithError(/500/);
  });

  describe('getClientById', () => {
    it('resolves undefined on 404, which means no such client', async () => {
      fetchSpy.and.resolveTo(respond({ error: 'not found' }, 404));
      const out = await createHttpClientSource({ baseUrl: 'https://api.test' }).getClientById('nope');
      expect(out).toBeUndefined();
    });

    it('throws on any other failure', async () => {
      fetchSpy.and.resolveTo(respond({ error: 'boom' }, 503));
      await expectAsync(
        Promise.resolve(createHttpClientSource({ baseUrl: 'https://api.test' }).getClientById('1'))
      ).toBeRejectedWithError(/503/);
    });

    it('returns the client on success', async () => {
      fetchSpy.and.resolveTo(respond(CLIENT));
      const out = await createHttpClientSource({ baseUrl: 'https://api.test' }).getClientById('1');
      expect(out).toEqual(CLIENT);
    });
  });
});

describe('createHttpSaveHandler', () => {
  let fetchSpy: jasmine.Spy;

  beforeEach(() => {
    fetchSpy = spyOn(window, 'fetch');
  });

  it('posts the record to /agreements', async () => {
    fetchSpy.and.resolveTo(respond({ id: 'a1', savedAt: '2026-07-26T00:00:00.000Z' }, 201));

    const outcome = await createHttpSaveHandler({ baseUrl: 'https://api.test' }).save({
      submission: SUBMISSION,
      element: document.createElement('div'),
    });

    expect(outcome).toBe('saved');
    const [url, init] = fetchSpy.calls.mostRecent().args;
    expect(url).toBe('https://api.test/agreements');
    expect(init.method).toBe('POST');
  });

  it('sends the full agreement text, not just a reference', async () => {
    fetchSpy.and.resolveTo(respond({ id: 'a1', savedAt: 'now' }, 201));

    await createHttpSaveHandler({ baseUrl: 'https://api.test' }).save({
      submission: SUBMISSION,
      element: document.createElement('div'),
    });

    const sent = JSON.parse(fetchSpy.calls.mostRecent().args[1].body);
    expect(sent.agreementClauses.length).toBe(1);
    expect(sent.agreementClauses[0].heading).toBe('1. Services');
    expect(sent.agreementVersion).toBe('1.0.0');
    expect(sent.signatureDataUrl).toBe(SUBMISSION.signatureDataUrl);
  });

  // Must not report success for a record the backend rejected.
  it('rejects when the backend refuses the record', async () => {
    fetchSpy.and.resolveTo(respond({ error: 'agreementClauses must be non-empty' }, 400));

    await expectAsync(
      createHttpSaveHandler({ baseUrl: 'https://api.test' }).save({
        submission: SUBMISSION,
        element: document.createElement('div'),
      })
    ).toBeRejectedWithError(/400/);
  });
});
