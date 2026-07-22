import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MatToolbarModule],
  template: `
    <mat-toolbar color="primary" class="app-toolbar">
      <span class="toolbar-logo">FormD</span>
      <span class="toolbar-subtitle">Digital Signing System</span>
    </mat-toolbar>
    <main class="app-main">
      <router-outlet></router-outlet>
    </main>
  `,
  styles: [`
    .app-toolbar { display: flex; align-items: baseline; gap: 12px; }
    .toolbar-logo { font-size: 22px; font-weight: 800; letter-spacing: 2px; }
    .toolbar-subtitle { font-size: 13px; opacity: 0.75; font-weight: 300; }
    .app-main { padding: 0; }
  `],
})
export class AppComponent {}
