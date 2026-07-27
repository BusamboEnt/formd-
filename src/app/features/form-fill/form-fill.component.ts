import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FormDefinition, FieldValues } from '../../core/models/form-definition.model';
import { Client } from '../../core/models/client.model';
import { FormOverlayComponent } from './form-overlay.component';

/**
 * Fills and signs a document-backed form.
 *
 * The counterpart to the clause wizard: that renders an agreement we author,
 * this renders one the client already had and signs it in place.
 */
@Component({
  selector: 'app-form-fill',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatSnackBarModule,
    FormOverlayComponent,
  ],
  template: `
    <div class="fill-container">
      <mat-card class="fill-card">
        <mat-card-content>
          <header class="fill-header">
            <div>
              <h2>{{ definition?.title || 'Form' }}</h2>
              <p *ngIf="definition">
                {{ definition.fields.length }} field(s) ·
                version {{ definition.version }} ·
                {{ originLabel }}
              </p>
            </div>
            <button
              mat-raised-button
              color="primary"
              [disabled]="!definition || !complete || saving"
              (click)="sign()"
            >
              <mat-icon>draw</mat-icon>
              {{ saving ? 'Signing…' : 'Sign & Save' }}
            </button>
          </header>

          <p class="loading" *ngIf="!definition && !loadError">Loading form…</p>
          <p class="error" *ngIf="loadError">{{ loadError }}</p>

          <!-- Placed by the import engine, or by hand for a document that
               arrived without field definitions. The note describes work that
               has to be doable from here, so it carries the way to do it. -->
          <p class="note" *ngIf="definition?.origin?.note">
            {{ definition!.origin.note }}
            <a class="note-action" [href]="designUrl" *ngIf="designUrl">Place fields on it</a>
          </p>

          <app-form-overlay
            *ngIf="definition"
            [definition]="definition"
            [client]="client"
            (valuesChange)="values = $event"
            (completeChange)="complete = $event"
          ></app-form-overlay>

          <div class="signed" *ngIf="signedUrl">
            <mat-icon>check_circle</mat-icon>
            <span>Signed.</span>
            <a [href]="apiBaseUrl + signedUrl" target="_blank" rel="noopener">Open the signed document</a>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .fill-container { max-width: 1000px; margin: 24px auto; padding: 0 16px; }
    .fill-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 16px; flex-wrap: wrap; margin-bottom: 16px;
      padding-bottom: 16px; border-bottom: 1px solid var(--border);
    }
    .fill-header h2 { margin: 0 0 2px; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
    .fill-header p { margin: 0; color: var(--muted-foreground); font-size: 13px; }
    .loading { color: var(--muted-foreground); }
    .error { color: var(--destructive); }
    .note {
      background: var(--muted); border: 1px solid var(--border); border-radius: var(--radius-sm);
      padding: 10px 14px; font-size: 13px; color: var(--muted-foreground); margin: 0 0 16px;
    }
    .note-action { color: var(--foreground); font-weight: 500; margin-left: 6px; }
    .signed {
      display: flex; align-items: center; gap: 8px; margin-top: 20px;
      color: var(--success); font-size: 14px;
    }
    .signed a { color: inherit; }
  `],
})
export class FormFillComponent implements OnInit {
  /** Which imported form to fill. */
  @Input() formId = '';
  /** Backend implementing backend/openapi.yaml. */
  @Input() apiBaseUrl = '';
  @Input() client: Client | null = null;

  private snackBar = inject(MatSnackBar);

  definition: FormDefinition | null = null;
  values: FieldValues = {};
  complete = false;
  saving = false;
  loadError = '';
  signedUrl = '';

  /**
   * Where to go to place fields on this document.
   *
   * Only offered in the app shell. An embedded `<formd-wizard>` sits in
   * someone else's page, where a link to our own URL layout would be wrong —
   * that host sets `design` on the element instead.
   */
  get designUrl(): string {
    if (!this.definition || typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    if (!params.has('form')) return '';
    params.set('design', '1');
    return `?${params}`;
  }

  get originLabel(): string {
    const source = this.definition?.origin?.source;
    if (source === 'acroform') return 'fields read from the document';
    if (source === 'converted') return 'converted, fields placed by hand';
    return 'authored';
  }

  async ngOnInit(): Promise<void> {
    if (!this.formId) {
      this.loadError = 'No form specified.';
      return;
    }
    try {
      const res = await fetch(`${this.apiBaseUrl}/forms/${encodeURIComponent(this.formId)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const definition: FormDefinition = await res.json();
      // The definition's document URL is server-relative; make it fetchable
      // from wherever this widget happens to be hosted.
      definition.document = {
        ...definition.document,
        url: `${this.apiBaseUrl}${definition.document.url}`,
      };
      this.definition = definition;
    } catch (err) {
      console.error('FormD: could not load form definition', err);
      this.loadError = 'Could not load this form. Check the form id and the backend URL.';
    }
  }

  async sign(): Promise<void> {
    if (!this.definition) return;
    this.saving = true;
    this.signedUrl = '';

    try {
      const res = await fetch(`${this.apiBaseUrl}/forms/${this.definition.id}/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client: this.client ?? { id: 'anonymous', name: 'Unnamed client' },
          values: this.values,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        // The backend rejects a missing required field or a malformed
        // signature with a message worth showing verbatim.
        this.snackBar.open(body.error ?? `Signing failed (${res.status})`, 'OK', { duration: 6000 });
        return;
      }

      this.signedUrl = body.documentUrl;
      this.snackBar.open('Signed successfully.', 'OK', {
        duration: 4000,
        panelClass: 'snack-success',
      });
    } catch (err) {
      console.error('FormD: signing failed', err);
      this.snackBar.open('Could not reach the server to sign this form.', 'OK', { duration: 6000 });
    } finally {
      this.saving = false;
    }
  }
}
