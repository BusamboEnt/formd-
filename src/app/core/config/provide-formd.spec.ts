import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { provideFormd } from './provide-formd';
import {
  ClientSource,
  SaveContext,
  SaveHandler,
  SaveOutcome,
  FORMD_AGREEMENT,
  FORMD_CLIENT_SOURCE,
  FORMD_SAVE_HANDLER,
  toObservable,
} from './formd.config';
import { SERVICE_AGREEMENT } from '../data/service-agreement';
import { ClientService } from '../services/client.service';
import { FormSaveService } from '../services/form-save.service';
import { AgreementTemplate } from '../models/agreement.model';
import { Client } from '../models/client.model';

const CUSTOM_AGREEMENT: AgreementTemplate = {
  title: 'SUPPLY AGREEMENT',
  version: '9.9.9',
  provider: 'Acme Ltd',
  clauses: [{ heading: '1. Goods', body: 'Acme supplies goods.' }],
  acknowledgement: 'I accept the supply terms.',
};

const CUSTOM_CLIENT: Client = {
  id: 'x1', name: 'Custom Client', address: '1 Somewhere', city: 'Town',
  postalCode: '0001', email: 'c@example.com', phone: '+27 00 000 0000',
  referenceNumber: 'CUS-1',
};

describe('provideFormd', () => {
  describe('defaults', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({ providers: [provideHttpClient(), provideFormd()] });
    });

    it('falls back to the bundled agreement', () => {
      expect(TestBed.inject(FORMD_AGREEMENT)).toBe(SERVICE_AGREEMENT);
    });

    it('falls back to the built-in client source', () => {
      expect(TestBed.inject(FORMD_CLIENT_SOURCE)).toBe(TestBed.inject(ClientService));
    });

    it('falls back to the built-in save handler', () => {
      expect(TestBed.inject(FORMD_SAVE_HANDLER)).toBe(TestBed.inject(FormSaveService));
    });
  });

  describe('overrides', () => {
    it('uses a supplied agreement', () => {
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideFormd({ agreement: CUSTOM_AGREEMENT })],
      });
      const agreement = TestBed.inject(FORMD_AGREEMENT);
      expect(agreement.title).toBe('SUPPLY AGREEMENT');
      expect(agreement.version).toBe('9.9.9');
    });

    it('uses a supplied client source', (done) => {
      const source: ClientSource = {
        searchClients: () => of([CUSTOM_CLIENT]),
        getClientById: () => of(CUSTOM_CLIENT),
      };
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideFormd({ clientSource: source })],
      });

      toObservable(TestBed.inject(FORMD_CLIENT_SOURCE).searchClients('anything')).subscribe((r) => {
        expect(r).toEqual([CUSTOM_CLIENT]);
        done();
      });
    });

    // The point of the handler seam: an embedding app can ship the record to
    // its own backend instead of writing files locally.
    it('uses a supplied save handler', async () => {
      const seen: SaveContext[] = [];
      const handler: SaveHandler = {
        save: (ctx): Promise<SaveOutcome> => { seen.push(ctx); return Promise.resolve('saved'); },
      };
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideFormd({ saveHandler: handler })],
      });

      const context = {
        element: document.createElement('div'),
        submission: { client: CUSTOM_CLIENT } as any,
      };
      await expectAsync(TestBed.inject(FORMD_SAVE_HANDLER).save(context)).toBeResolvedTo('saved');
      expect(seen.length).toBe(1);
      expect(seen[0].submission.client).toBe(CUSTOM_CLIENT);
    });

    it('leaves untouched options on their defaults', () => {
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideFormd({ agreement: CUSTOM_AGREEMENT })],
      });
      expect(TestBed.inject(FORMD_AGREEMENT)).toBe(CUSTOM_AGREEMENT);
      expect(TestBed.inject(FORMD_CLIENT_SOURCE)).toBe(TestBed.inject(ClientService));
      expect(TestBed.inject(FORMD_SAVE_HANDLER)).toBe(TestBed.inject(FormSaveService));
    });
  });
});
