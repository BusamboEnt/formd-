import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { LoadingService } from './core/services/loading.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MatToolbarModule, MatProgressBarModule, AsyncPipe],
  template: `
    <mat-toolbar color="primary" class="app-toolbar">
      <span class="toolbar-logo">FormD</span>
      <span class="toolbar-subtitle">Digital Signing System</span>
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
    .app-toolbar { display: flex; align-items: baseline; gap: 12px; position: relative; }
    .toolbar-logo { font-size: 22px; font-weight: 800; letter-spacing: 2px; }
    .toolbar-subtitle { font-size: 13px; opacity: 0.75; font-weight: 300; }
    .app-main { padding: 0; }
    .global-loader { position: absolute; z-index: 10; left: 0; right: 0; }
  `],
})
export class AppComponent {
  protected loading = inject(LoadingService);
}
