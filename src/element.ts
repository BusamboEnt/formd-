import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { FormdElementComponent } from './app/elements/formd-element.component';
import { provideFormdElement } from './app/elements/provide-formd-element';
import {
  createHttpClientSource,
  createHttpSaveHandler,
} from './app/core/adapters/http-client-source';

/**
 * Entry point for the framework-agnostic build.
 *
 * Produces a `<formd-wizard>` custom element usable from React, Vue or plain
 * HTML. Configuration is set as DOM properties (not attributes — these are
 * objects and functions, which attributes cannot carry):
 *
 *   const el = document.querySelector('formd-wizard');
 *   el.agreement   = { title: 'SUPPLY AGREEMENT', version: '2.0.0', ... };
 *   el.clientSource = { searchClients: q => ..., getClientById: id => ... };
 *   el.saveHandler  = { save: ({ submission }) => api.post('/agreements', submission) };
 *   el.addEventListener('saved', e => console.log(e.detail));
 */
/**
 * Helpers for hosts wiring the element to a backend implementing
 * backend/openapi.yaml, so they do not hand-write fetch calls:
 *
 *   el.clientSource = FormD.createHttpClientSource({ baseUrl: 'https://api.example.com' });
 *   el.saveHandler  = FormD.createHttpSaveHandler({ baseUrl: 'https://api.example.com' });
 */
(window as any).FormD = { createHttpClientSource, createHttpSaveHandler };

(async () => {
  const app = await createApplication({
    providers: [provideAnimations(), provideHttpClient(), provideFormdElement()],
  });

  const element = createCustomElement(FormdElementComponent, { injector: app.injector });

  if (!customElements.get('formd-wizard')) {
    customElements.define('formd-wizard', element);
  }
})();
