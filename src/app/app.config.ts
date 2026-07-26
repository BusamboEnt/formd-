import { ApplicationConfig } from '@angular/core';
// Async variant: the animations module is loaded lazily on first use instead of
// being pulled into the initial bundle (~62 kB raw off the entry point).
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient } from '@angular/common/http';

import { provideFormd } from './core/config/provide-formd';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimationsAsync(),
    provideHttpClient(),
    // No arguments: every piece falls back to the built-in defaults. An
    // embedding application passes its own agreement, client source and
    // save handler here.
    provideFormd(),
  ],
};
