import { Client } from '../models/client.model';
import { FormSubmission } from '../models/form-submission.model';
import { ClientSource, SaveContext, SaveHandler, SaveOutcome } from '../config/formd.config';

export interface HttpBackendOptions {
  /** Base URL of a backend satisfying backend/openapi.yaml, no trailing slash. */
  baseUrl: string;
  /** Extra headers, e.g. an Authorization token. */
  headers?: Record<string, string>;
  /** Passed through to fetch; defaults to 'same-origin'. */
  credentials?: RequestCredentials;
}

function endpoint(options: HttpBackendOptions, path: string): string {
  return `${options.baseUrl.replace(/\/$/, '')}${path}`;
}

async function request<T>(options: HttpBackendOptions, path: string, init?: RequestInit): Promise<T> {
  // content-type is set only when there is a body. Sending it on a GET makes
  // the request non-simple and forces a CORS preflight for no reason.
  const headers: Record<string, string> = { ...options.headers, ...(init?.headers as Record<string, string>) };
  if (init?.body) headers['content-type'] = 'application/json';

  const res = await fetch(endpoint(options, path), {
    ...init,
    credentials: options.credentials ?? 'same-origin',
    headers,
  });

  if (!res.ok) {
    // Thrown rather than swallowed: the widget distinguishes a failed lookup
    // from a client that does not exist, and cannot do that if faults are
    // flattened into empty results here.
    const detail = await res.text().catch(() => '');
    throw new Error(`FormD backend ${res.status} on ${path}${detail ? `: ${detail}` : ''}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Wires the widget to any backend implementing the FormD contract.
 *
 * Returns plain Promises rather than Observables, which the widget normalizes,
 * so this is usable from Angular and from a plain-JavaScript host embedding the
 * custom element.
 *
 *   provideFormd({ clientSource: createHttpClientSource({ baseUrl: '/api' }) })
 */
export function createHttpClientSource(options: HttpBackendOptions): ClientSource {
  return {
    searchClients: (query: string) =>
      request<Client[]>(options, `/clients?search=${encodeURIComponent(query)}`),

    getClientById: async (id: string) => {
      const res = await fetch(endpoint(options, `/clients/${encodeURIComponent(id)}`), {
        credentials: options.credentials ?? 'same-origin',
        headers: { ...options.headers },
      });
      // A 404 is a genuine "no such client"; anything else is a fault.
      if (res.status === 404) return undefined;
      if (!res.ok) throw new Error(`FormD backend ${res.status} on /clients/${id}`);
      return res.json() as Promise<Client>;
    },
  };
}

/**
 * Posts signed records to a backend implementing the FormD contract, instead
 * of writing files to the local machine.
 *
 *   provideFormd({ saveHandler: createHttpSaveHandler({ baseUrl: '/api' }) })
 */
export function createHttpSaveHandler(options: HttpBackendOptions): SaveHandler {
  return {
    async save({ submission }: SaveContext): Promise<SaveOutcome> {
      await request<{ id: string; savedAt: string }>(options, '/agreements', {
        method: 'POST',
        body: JSON.stringify(submission satisfies FormSubmission),
      });
      // Errors propagate so the widget reports a failure rather than claiming
      // a save that did not happen.
      return 'saved';
    },
  };
}
