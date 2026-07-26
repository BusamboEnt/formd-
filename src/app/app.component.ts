import {
  AfterViewInit,
  Component,
  ViewChild,
  ViewContainerRef,
  inject,
} from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { LoadingService } from './core/services/loading.service';
import { FORMD_BRANDING } from './core/config/formd.copy';
import { WizardComponent } from './features/wizard/wizard.component';

@Component({
  selector: 'app-root',
  standalone: true,
  // Two flows, selected from the query string rather than a router: the app
  // has no navigable history to speak of, and @angular/router costs 62 kB for
  // one decision made once at startup.
  imports: [WizardComponent, MatToolbarModule, MatProgressBarModule, AsyncPipe, NgIf],
  template: `
    <mat-toolbar class="app-toolbar">
      <span class="toolbar-logo">{{ branding.name }}</span>
      <span class="toolbar-subtitle" *ngIf="branding.tagline">{{ branding.tagline }}</span>
    </mat-toolbar>
    <mat-progress-bar
      *ngIf="loading.loading$ | async"
      mode="indeterminate"
      class="global-loader"
    ></mat-progress-bar>
    <main class="app-main">
      <!-- The form-fill flow is created here at runtime, so neither it nor
           pdf.js reaches a session that only uses the clause wizard. -->
      <ng-container #formHost></ng-container>
      <app-wizard *ngIf="!formId"></app-wizard>
    </main>
  `,
  styles: [`
    .app-toolbar {
      display: flex; align-items: baseline; gap: 12px; position: relative;
      background: var(--background); color: var(--foreground);
      border-bottom: 1px solid var(--border); height: 56px; padding: 0 24px;
    }
    .toolbar-logo { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
    .toolbar-subtitle { font-size: 13px; color: var(--muted-foreground); font-weight: 400; }
    .app-main { padding: 0; }
    .global-loader { position: absolute; z-index: 10; left: 0; right: 0; }
  `],
})
export class AppComponent implements AfterViewInit {
  protected loading = inject(LoadingService);
  readonly branding = inject(FORMD_BRANDING);

  @ViewChild('formHost', { read: ViewContainerRef }) formHost!: ViewContainerRef;

  /** `?form=<id>` fills that imported document instead of the clause wizard. */
  readonly formId: string;
  /** `?api=<url>` points at the backend holding it. */
  readonly apiBaseUrl: string;

  constructor() {
    const params = new URLSearchParams(window.location.search);
    this.formId = params.get('form') ?? '';
    this.apiBaseUrl = (params.get('api') ?? '').replace(/\/$/, '');
  }

  async ngAfterViewInit(): Promise<void> {
    if (!this.formId) return;

    // Imported dynamically: this flow pulls in pdf.js, the dialog and the
    // overlay, none of which a clause-only session should pay for.
    const { FormFillComponent } = await import('./features/form-fill/form-fill.component');
    const ref = this.formHost.createComponent(FormFillComponent);
    ref.setInput('formId', this.formId);
    ref.setInput('apiBaseUrl', this.apiBaseUrl);
  }
}
