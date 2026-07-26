import { InjectionToken } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { Client } from '../models/client.model';
import { AgreementTemplate } from '../models/agreement.model';
import { FormSubmission } from '../models/form-submission.model';

/** Whether bytes actually reached their destination. 'cancelled' means the
 *  operator backed out and nothing was persisted — it must never be reported
 *  as success. */
export type SaveOutcome = 'saved' | 'cancelled';

/**
 * What a host may return from a ClientSource method.
 *
 * RxJS is Angular's idiom, not the caller's. A plain-JavaScript host embedding
 * the custom element will naturally return a Promise or a plain array, and
 * requiring them to construct an Observable would leak Angular's internals
 * into a framework-agnostic contract. All three are accepted and normalized.
 */
export type SourceResult<T> = Observable<T> | Promise<T> | T;

/**
 * Where client records come from. The built-in implementation reads mock data
 * or a REST endpoint, but an embedding application supplies its own — its own
 * database, its own CRM, its own auth.
 */
export interface ClientSource {
  searchClients(query: string): SourceResult<Client[]>;
  getClientById(id: string): SourceResult<Client | undefined>;
}

/**
 * Normalizes whatever a host returned into an Observable.
 *
 * Duck-typed rather than using `instanceof`, so an Observable from a different
 * RxJS copy in the host's bundle is still recognised. Note a plain array is
 * emitted as one value — `from()` would emit each element separately, which
 * would be wrong for a `Client[]`.
 */
export function toObservable<T>(result: SourceResult<T>): Observable<T> {
  if (result && typeof (result as Observable<T>).subscribe === 'function') {
    return result as Observable<T>;
  }
  if (result && typeof (result as Promise<T>).then === 'function') {
    return from(result as Promise<T>);
  }
  return of(result as T);
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
