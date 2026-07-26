import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AsyncPipe, NgIf } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { LoadingService } from './core/services/loading.service';
import { FORMD_BRANDING } from './core/config/formd.copy';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MatToolbarModule, MatProgressBarModule, AsyncPipe, NgIf],
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
      <router-outlet></router-outlet>
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
export class AppComponent {
  protected loading = inject(LoadingService);
  readonly branding = inject(FORMD_BRANDING);
}
