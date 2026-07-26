import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Client } from '../models/client.model';
import { AgreementTemplate } from '../models/agreement.model';
import { FormSubmission } from '../models/form-submission.model';

/** Whether bytes actually reached their destination. 'cancelled' means the
 *  operator backed out and nothing was persisted — it must never be reported
 *  as success. */
export type SaveOutcome = 'saved' | 'cancelled';

/**
 * Where client records come from. The built-in implementation reads mock data
 * or a REST endpoint, but an embedding application supplies its own — its own
 * database, its own CRM, its own auth.
 */
export interface ClientSource {
  searchClients(query: string): Observable<Client[]>;
  getClientById(id: string): Observable<Client | undefined>;
}

/** Everything a save handler needs to persist a signed agreement. */
export interface SaveContext {
  /** The signed record, including the full agreement text and signature. */
  submission: FormSubmission;
  /** The rendered agreement, for handlers that want to rasterize it. */
  element: HTMLElement;
}

/**
 * What happens to a signed agreement. The built-in handler writes a PNG and a
 * JSON to local disk; an embedding application might POST to its own API,
 * push to object storage, or do both.
 */
export interface SaveHandler {
  save(context: SaveContext): Promise<SaveOutcome>;
}

/** The contract text presented and recorded. */
export const FORMD_AGREEMENT = new InjectionToken<AgreementTemplate>('FORMD_AGREEMENT');

/** Supplies client records to the search step. */
export const FORMD_CLIENT_SOURCE = new InjectionToken<ClientSource>('FORMD_CLIENT_SOURCE');

/** Persists the signed agreement. */
export const FORMD_SAVE_HANDLER = new InjectionToken<SaveHandler>('FORMD_SAVE_HANDLER');
