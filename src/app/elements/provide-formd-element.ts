import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { ClientService } from '../core/services/client.service';
import { FormSaveService } from '../core/services/form-save.service';
import {
  FORMD_AGREEMENT,
  FORMD_CLIENT_SOURCE,
  FORMD_SAVE_HANDLER,
} from '../core/config/formd.config';
import { FormdRuntime } from './formd-runtime';

/**
 * Element-flavoured counterpart to `provideFormd()`.
 *
 * The tokens resolve through FormdRuntime so DOM properties set on the custom
 * element take effect, falling back to the same built-in defaults when the
 * host supplies nothing.
 */
export function provideFormdElement(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: FORMD_AGREEMENT,
      useFactory: (rt: FormdRuntime) => rt.agreement,
      deps: [FormdRuntime],
    },
    {
      provide: FORMD_CLIENT_SOURCE,
      useFactory: (rt: FormdRuntime, fallback: ClientService) => rt.clientSource ?? fallback,
      deps: [FormdRuntime, ClientService],
    },
    {
      provide: FORMD_SAVE_HANDLER,
      useFactory: (rt: FormdRuntime, fallback: FormSaveService) => rt.saveHandler ?? fallback,
      deps: [FormdRuntime, FormSaveService],
    },
  ]);
}
