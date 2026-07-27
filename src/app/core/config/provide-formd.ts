import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { AgreementTemplate } from '../models/agreement.model';
import { SERVICE_AGREEMENT } from '../data/service-agreement';
import { ClientService } from '../services/client.service';
import { FormSaveService } from '../services/form-save.service';
import {
  ClientSource,
  SaveHandler,
  FORMD_AGREEMENT,
  FORMD_CLIENT_SOURCE,
  FORMD_SAVE_HANDLER,
} from './formd.config';
import {
  DeepPartial,
  DEFAULT_BRANDING,
  FormdBranding,
  FormdCopy,
  FORMD_BRANDING,
  FORMD_COPY,
  mergeCopy,
} from './formd.copy';

export interface FormdConfig {
  /** Contract text to present and record. Defaults to the bundled sample. */
  agreement?: AgreementTemplate;
  /** Where client records come from. Defaults to the built-in mock/REST source. */
  clientSource?: ClientSource;
  /** What happens to a signed agreement. Defaults to writing PNG + JSON locally. */
  saveHandler?: SaveHandler;
  /** Brand mark and tagline. Partial — unset fields keep their defaults. */
  branding?: Partial<FormdBranding>;
  /** User-facing strings. Partial at the group level. */
  copy?: DeepPartial<FormdCopy>;
}

/**
 * Wires FormD into an application.
 *
 * Every option falls back to the built-in behaviour, so the defaults still
 * produce a working demo, while an embedding application can replace any piece
 * without forking:
 *
 *   provideFormd({
 *     agreement: MY_CONTRACT,
 *     clientSource: myCrmAdapter,
 *     saveHandler: { save: ({ submission }) => api.post('/agreements', submission) },
 *   })
 */
export function provideFormd(config: FormdConfig = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: FORMD_AGREEMENT, useValue: config.agreement ?? SERVICE_AGREEMENT },

    config.clientSource
      ? { provide: FORMD_CLIENT_SOURCE, useValue: config.clientSource }
      : { provide: FORMD_CLIENT_SOURCE, useExisting: ClientService },

    config.saveHandler
      ? { provide: FORMD_SAVE_HANDLER, useValue: config.saveHandler }
      : { provide: FORMD_SAVE_HANDLER, useExisting: FormSaveService },

    { provide: FORMD_BRANDING, useValue: { ...DEFAULT_BRANDING, ...config.branding } },
    { provide: FORMD_COPY, useValue: mergeCopy(config.copy) },
  ]);
}
