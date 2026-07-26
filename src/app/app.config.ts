import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { provideFormd } from './core/config/provide-formd';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(),
    // No arguments: every piece falls back to the built-in defaults. An
    // embedding application passes its own agreement, client source and
    // save handler here.
    provideFormd(),
  ],
};
