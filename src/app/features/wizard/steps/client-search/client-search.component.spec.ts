import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { ClientSearchComponent } from './client-search.component';
import { FORMD_CLIENT_SOURCE, ClientSource } from '../../../../core/config/formd.config';
import { Client } from '../../../../core/models/client.model';

const CLIENT: Client = {
  id: '1', name: 'John Doe', address: '12 Main Street', city: 'Johannesburg',
  postalCode: '2000', email: 'john.doe@example.com', phone: '+27 11 000 0001',
  referenceNumber: 'REF-2024-001',
};

/** Lets each test decide what the client source does, and in what shape. */
class StubSource implements ClientSource {
  next: () => any = () => of([]);
  searchClients(): any { return this.next(); }
  getClientById(): Observable<Client | undefined> { return of(undefined); }
}

describe('ClientSearchComponent', () => {
  let fixture: ComponentFixture<ClientSearchComponent>;
  let component: ClientSearchComponent;
  let source: StubSource;

  beforeEach(async () => {
    source = new StubSource();
    await TestBed.configureTestingModule({
      imports: [ClientSearchComponent, NoopAnimationsModule],
      providers: [{ provide: FORMD_CLIENT_SOURCE, useValue: source }],
    }).compileComponents();

    fixture = TestBed.createComponent(ClientSearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  /**
   * Type a query and let the 300ms debounce elapse. Rendering the result can
   * leave Material timers queued, which fakeAsync treats as a failure, so they
   * are drained before the test asserts.
   */
  function search(query: string): void {
    component.searchCtrl.setValue(query);
    tick(400);
    fixture.detectChanges();
    flush();
  }

  it('ignores queries shorter than two characters', fakeAsync(() => {
    const spy = spyOn(source, 'searchClients').and.callThrough();
    search('j');
    expect(spy).not.toHaveBeenCalled();
  }));

  it('surfaces matches', fakeAsync(() => {
    source.next = () => of([CLIENT]);
    search('john');
    expect(component.results).toEqual([CLIENT]);
    expect(component.searchFailed).toBeFalse();
  }));

  it('reports an empty result set as no matches, not a failure', fakeAsync(() => {
    source.next = () => of([]);
    search('nobody');
    expect(component.results).toEqual([]);
    expect(component.searched).toBeTrue();
    expect(component.searchFailed).toBeFalse();
  }));

  // A plain-JavaScript host embedding the custom element will not construct an
  // Observable. Requiring one produced "searchClients(...).pipe is not a
  // function" the first time the element was driven from a non-Angular page.
  describe('accepts whatever shape the host returns', () => {
    it('an Observable', fakeAsync(() => {
      source.next = () => of([CLIENT]);
      search('john');
      expect(component.results).toEqual([CLIENT]);
    }));

    it('a Promise', fakeAsync(() => {
      source.next = () => Promise.resolve([CLIENT]);
      search('john');
      expect(component.results).toEqual([CLIENT]);
      expect(component.searchFailed).toBeFalse();
    }));

    it('a plain array, emitted whole rather than element by element', fakeAsync(() => {
      source.next = () => [CLIENT, { ...CLIENT, id: '2', name: 'Jane' }];
      search('john');
      expect(component.results.length).toBe(2);
    }));

    it('a rejected Promise, surfaced as a failure', fakeAsync(() => {
      source.next = () => Promise.reject(new Error('network down'));
      search('john');
      expect(component.searchFailed).toBeTrue();
    }));
  });

  describe('when the client service is unreachable', () => {
    beforeEach(() => {
      source.next = () => throwError(() => new Error('network down'));
    });

    // The defect this guards: a dead API used to render as "No clients
    // matched your search", which reads as a data problem, not an outage.
    it('flags the failure rather than showing an empty result', fakeAsync(() => {
      search('john');
      expect(component.searchFailed).toBeTrue();
    }));

    it('shows an outage message and hides the no-matches message', fakeAsync(() => {
      search('john');
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.search-failed')?.textContent)
        .toContain('Could not reach the client service');
      expect(el.querySelector('.empty-state')).toBeNull();
    }));

    it('stops the loading indicator', fakeAsync(() => {
      search('john');
      expect(component.loading).toBeFalse();
    }));

    // A single failed request must not kill the valueChanges stream.
    it('recovers on the next successful query', fakeAsync(() => {
      search('john');
      expect(component.searchFailed).toBeTrue();

      source.next = () => of([CLIENT]);
      search('john doe');

      expect(component.searchFailed).toBeFalse();
      expect(component.results).toEqual([CLIENT]);
    }));
  });

  it('clears failure state on reset', fakeAsync(() => {
    source.next = () => throwError(() => new Error('network down'));
    search('john');
    expect(component.searchFailed).toBeTrue();

    component.reset();
    tick(400);
    flush();

    expect(component.searchFailed).toBeFalse();
    expect(component.results).toEqual([]);
    expect(component.selectedClient).toBeNull();
  }));
});
