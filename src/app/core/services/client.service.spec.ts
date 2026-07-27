import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClientService } from './client.service';
import { LoadingService } from './loading.service';
import { Client } from '../models/client.model';
import { environment } from '../../../environments/environment';

describe('ClientService', () => {
  let service: ClientService;
  let loading: LoadingService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    service = TestBed.inject(ClientService);
    loading = TestBed.inject(LoadingService);
  });

  function search(query: string): Client[] {
    let out: Client[] = [];
    service.searchClients(query).subscribe((r) => (out = r));
    tick(500);
    return out;
  }

  it('matches on client name, case-insensitively', fakeAsync(() => {
    expect(search('john').map((c) => c.name)).toContain('John Doe');
  }));

  it('matches on reference number', fakeAsync(() => {
    const results = search('REF-2024-002');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Jane Smith');
  }));

  it('matches on company name', fakeAsync(() => {
    expect(search('Brown Solutions').map((c) => c.name)).toContain('Michael Brown');
  }));

  it('returns an empty list when nothing matches', fakeAsync(() => {
    expect(search('zzzz-no-such-client')).toEqual([]);
  }));

  it('returns every partial match', fakeAsync(() => {
    // "John" appears in both "John Doe" and "Robert Johnson".
    expect(search('john').length).toBe(2);
  }));

  it('looks a client up by id', fakeAsync(() => {
    let found: Client | undefined;
    service.getClientById('3').subscribe((c) => (found = c));
    tick(500);
    expect(found?.name).toBe('Robert Johnson');
  }));

  it('resolves to undefined for an unknown id', fakeAsync(() => {
    let found: Client | undefined = {} as Client;
    service.getClientById('nope').subscribe((c) => (found = c));
    tick(500);
    expect(found).toBeUndefined();
  }));

  // The production build shipped a placeholder apiBaseUrl with errors mapped
  // to an empty array, so an API that did not exist looked exactly like a
  // client list with no matches. Both halves of that are covered here.
  describe('misconfiguration', () => {
    let originalMock: boolean;
    let originalUrl: string;

    beforeEach(() => {
      originalMock = environment.useMockData;
      originalUrl = environment.apiBaseUrl;
      // Simulate a production build whose apiBaseUrl was never filled in.
      (environment as any).useMockData = false;
      (environment as any).apiBaseUrl = '';
    });

    afterEach(() => {
      (environment as any).useMockData = originalMock;
      (environment as any).apiBaseUrl = originalUrl;
    });

    it('throws a named error when a real API is expected but none is configured', () => {
      expect(() => service.searchClients('john')).toThrowError(/apiBaseUrl is not configured/);
    });

    it('throws on lookup by id too, not just search', () => {
      expect(() => service.getClientById('1')).toThrowError(/apiBaseUrl is not configured/);
    });
  });

  // Exercises the real HTTP branch rather than mock mode. Without these, the
  // service could go back to mapping failures onto an empty array and every
  // other spec would still pass, because they either use mock data or a stub.
  describe('against a live API', () => {
    let http: HttpTestingController;
    let apiService: ClientService;
    let originalMock: boolean;
    let originalUrl: string;

    beforeEach(() => {
      originalMock = environment.useMockData;
      originalUrl = environment.apiBaseUrl;
      (environment as any).useMockData = false;
      (environment as any).apiBaseUrl = 'https://api.test/v1';

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      apiService = TestBed.inject(ClientService);
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
      (environment as any).useMockData = originalMock;
      (environment as any).apiBaseUrl = originalUrl;
      http.verify();
    });

    it('requests the configured endpoint with the search term', () => {
      apiService.searchClients('john').subscribe();
      const req = http.expectOne((r) => r.url === 'https://api.test/v1/clients');
      expect(req.request.params.get('search')).toBe('john');
      req.flush([]);
    });

    it('emits the records the API returned', () => {
      let got: Client[] | undefined;
      apiService.searchClients('john').subscribe((r) => (got = r));
      http.expectOne((r) => r.url === 'https://api.test/v1/clients').flush([
        { id: '1', name: 'API Client' } as Client,
      ]);
      expect(got?.[0].name).toBe('API Client');
    });

    // The production defect: a dead API was mapped to [] and rendered as
    // "no clients matched", so an outage was indistinguishable from no data.
    it('propagates a server error instead of reporting no matches', () => {
      let errored = false;
      let emitted: Client[] | undefined;

      apiService.searchClients('john').subscribe({
        next: (r) => (emitted = r),
        error: () => (errored = true),
      });
      http.expectOne((r) => r.url === 'https://api.test/v1/clients')
        .flush('boom', { status: 500, statusText: 'Server Error' });

      expect(errored).toBeTrue();
      expect(emitted).toBeUndefined();
    });

    it('propagates a network failure too', () => {
      let errored = false;
      apiService.searchClients('john').subscribe({ error: () => (errored = true) });
      http.expectOne((r) => r.url === 'https://api.test/v1/clients')
        .error(new ProgressEvent('network error'));
      expect(errored).toBeTrue();
    });

    it('clears the loading flag when the request fails', () => {
      const loadingService = TestBed.inject(LoadingService);
      let last = true;
      loadingService.loading$.subscribe((v) => (last = v));

      apiService.searchClients('john').subscribe({ error: () => {} });
      http.expectOne((r) => r.url === 'https://api.test/v1/clients')
        .flush('boom', { status: 500, statusText: 'Server Error' });

      expect(last).toBeFalse();
    });

    it('treats a 404 on lookup as an absent client, not a fault', () => {
      let result: Client | undefined | 'unset' = 'unset';
      apiService.getClientById('nope').subscribe({ next: (c) => (result = c) });
      http.expectOne('https://api.test/v1/clients/nope')
        .flush('missing', { status: 404, statusText: 'Not Found' });
      expect(result).toBeUndefined();
    });

    it('propagates non-404 lookup failures', () => {
      let errored = false;
      apiService.getClientById('1').subscribe({ error: () => (errored = true) });
      http.expectOne('https://api.test/v1/clients/1')
        .flush('boom', { status: 500, statusText: 'Server Error' });
      expect(errored).toBeTrue();
    });
  });

  describe('loading indicator', () => {
    it('signals loading while a search is in flight', fakeAsync(() => {
      const seen: boolean[] = [];
      loading.loading$.subscribe((v) => seen.push(v));

      service.searchClients('john').subscribe();
      tick(500);

      // false (initial) -> true (started) -> false (finished)
      expect(seen).toEqual([false, true, false]);
    }));

    it('clears the loading flag even when nothing matched', fakeAsync(() => {
      let last = true;
      service.searchClients('zzzz').subscribe();
      tick(500);
      loading.loading$.subscribe((v) => (last = v));
      expect(last).toBeFalse();
    }));
  });
});
