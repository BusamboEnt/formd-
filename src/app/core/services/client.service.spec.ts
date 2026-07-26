import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ClientService } from './client.service';
import { LoadingService } from './loading.service';
import { Client } from '../models/client.model';

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
