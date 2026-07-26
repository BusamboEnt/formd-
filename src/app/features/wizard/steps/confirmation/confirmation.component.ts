import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Client } from '../../../../core/models/client.model';
import { FormSubmission } from '../../../../core/models/form-submission.model';
import {
  FORMD_AGREEMENT,
  FORMD_SAVE_HANDLER,
  SaveOutcome,
} from '../../../../core/config/formd.config';

@Component({
  selector: 'app-confirmation',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="step-content">
      <h2 class="step-title">Review & Save</h2>
      <p class="step-subtitle">Confirm the details below, then save the signed agreement.</p>

      <div class="preview-wrapper" #previewEl id="signed-form-preview" *ngIf="client && signatureDataUrl">
        <!-- Compact document preview with signature -->
        <div class="preview-doc">
          <div class="preview-header">
            <span class="preview-logo">FormD</span>
            <span class="preview-ref">
              {{ client.referenceNumber }} | {{ today }} | v{{ agreement.version }}
            </span>
          </div>
          <h2 class="preview-title">{{ agreement.title }}</h2>
          <table class="preview-table">
            <tr><td>Client:</td><td><strong>{{ client.name }}</strong></td></tr>
            <tr *ngIf="client.companyName"><td>Company:</td><td>{{ client.companyName }}</td></tr>
            <tr><td>Address:</td><td>{{ client.address }}, {{ client.city }}</td></tr>
            <tr><td>Email:</td><td>{{ client.email }}</td></tr>
            <tr><td>Phone:</td><td>{{ client.phone }}</td></tr>
          </table>
          <!-- The rasterized PNG is the human-readable record, so it must
               show the terms it says were agreed to, not just the
               acknowledgement. -->
          <div class="preview-clauses">
            <section class="preview-clause" *ngFor="let clause of agreement.clauses">
              <h4>{{ clause.heading }}</h4>
              <p>{{ clause.body }}</p>
            </section>
          </div>

          <p class="preview-terms">{{ agreement.acknowledgement }}</p>
          <div class="sig-section">
            <div class="sig-block">
              <img [src]="signatureDataUrl" alt="Signature" class="sig-image" />
              <div class="sig-line"></div>
              <p class="sig-label">{{ client.name }} — Signature</p>
              <p class="sig-date">Signed: {{ today }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="save-actions" *ngIf="client && signatureDataUrl">
        <button
          mat-raised-button
          color="primary"
          [disabled]="saving"
          (click)="saveDocuments()"
        >
          <mat-icon>save_alt</mat-icon>
          {{ saving ? 'Saving…' : 'Save PNG & JSON' }}
        </button>
        <mat-spinner *ngIf="saving" diameter="24"></mat-spinner>
      </div>

      <div class="save-error" *ngIf="saveError">
        <mat-icon>error_outline</mat-icon>
        <p>Save failed. Please try again or check browser permissions.</p>
      </div>

      <div class="save-cancelled" *ngIf="saveCancelled">
        <mat-icon>cancel</mat-icon>
        <p>Save cancelled — nothing was written. Click Save to try again.</p>
      </div>

      <div class="save-success" *ngIf="saved">
        <mat-icon class="success-icon">check_circle</mat-icon>
        <p>Agreement saved successfully! Check your selected folder or Downloads.</p>
      </div>

      <div class="missing-data" *ngIf="!client || !signatureDataUrl">
        <mat-icon>warning</mat-icon>
        <p>Missing client details or signature. Please go back and complete the previous steps.</p>
      </div>
    </div>
  `,
  styles: [`
    .step-content { padding: 8px 0; }
    .step-title { margin: 0 0 4px; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
    .step-subtitle { margin: 0 0 24px; color: var(--muted-foreground); }

    .preview-wrapper {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      margin-bottom: 24px;
    }

    .preview-doc {
      background: #fff;
      padding: 28px 36px;
      font-family: 'Times New Roman', Times, serif;
      font-size: 13px;
      line-height: 1.5;
      color: var(--foreground);
    }

    .preview-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
      margin-bottom: 16px;
    }

    .preview-logo { font-family: Inter, sans-serif; font-size: 16px; font-weight: 800; color: var(--foreground); letter-spacing: 2px; }
    .preview-ref { font-size: 12px; color: var(--muted-foreground); }
    .preview-title { text-align: center; font-size: 16px; font-weight: 700; letter-spacing: 2px; text-decoration: underline; margin: 0 0 16px; }

    .preview-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    .preview-table td { padding: 4px 8px; }
    .preview-table td:first-child { width: 100px; color: var(--muted-foreground); }

    .preview-clauses { margin-bottom: 16px; }
    .preview-clause { margin-bottom: 10px; }
    .preview-clause h4 { font-size: 12px; font-weight: 700; margin: 0 0 2px; }
    .preview-clause p { font-size: 11px; line-height: 1.45; margin: 0; }

    .preview-terms {
      font-size: 12px;
      font-style: italic;
      color: var(--muted-foreground);
      border: 1px solid var(--border);
      padding: 10px 14px;
      border-radius: var(--radius-sm);
      margin-bottom: 20px;
    }

    .sig-section { display: flex; justify-content: flex-end; }

    .sig-block { width: 260px; text-align: center; }
    .sig-image { max-width: 100%; height: 80px; object-fit: contain; }
    .sig-line { border-bottom: 1px solid var(--foreground); margin: 4px 0; }
    .sig-label { font-size: 12px; margin: 4px 0 2px; }
    .sig-date { font-size: 11px; color: var(--muted-foreground); margin: 0; }

    .save-actions {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
    }

    .save-error, .save-cancelled, .save-success, .missing-data {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 8px;
    }
    .save-error, .missing-data { color: var(--destructive); }
    .save-cancelled { color: var(--muted-foreground); }
    .save-success { color: var(--success); }
    .success-icon { font-size: 28px; width: 28px; height: 28px; }
  `],
})
export class ConfirmationComponent implements OnChanges {
  @Input() client: Client | null = null;
  @Input() signatureDataUrl: string | null = null;
  /** Fires once a save attempt resolves, so an embedding host can react. */
  @Output() saveCompleted = new EventEmitter<{
    outcome: SaveOutcome;
    submission: FormSubmission;
  }>();
  @ViewChild('previewEl') previewEl!: ElementRef<HTMLElement>;

  private saveHandler = inject(FORMD_SAVE_HANDLER);
  private snackBar = inject(MatSnackBar);

  readonly agreement = inject(FORMD_AGREEMENT);

  today = '';
  saving = false;
  saved = false;
  saveError = false;
  saveCancelled = false;

  ngOnChanges(): void {
    this.saved = false;
    this.saving = false;
    this.saveError = false;
    this.saveCancelled = false;
    this.today = new Date().toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  async saveDocuments(): Promise<void> {
    if (!this.client || !this.signatureDataUrl || !this.previewEl) return;

    this.saving = true;
    this.saved = false;
    this.saveError = false;
    this.saveCancelled = false;

    const submission: FormSubmission = {
      client: this.client,
      formDate: this.today,
      agreementTitle: this.agreement.title,
      agreementVersion: this.agreement.version,
      agreementProvider: this.agreement.provider,
      agreementClauses: this.agreement.clauses,
      acknowledgement: this.agreement.acknowledgement,
      signatureDataUrl: this.signatureDataUrl,
      savedAt: new Date().toISOString(),
    };

    try {
      const outcome = await this.saveHandler.save({
        element: this.previewEl.nativeElement,
        submission,
      });
      if (outcome === 'saved') {
        this.snackBar.open('Agreement saved successfully!', 'OK', { duration: 4000, panelClass: 'snack-success' });
        this.saved = true;
      } else {
        // Dismissed dialog — nothing was written, so do not claim otherwise.
        this.snackBar.open('Save cancelled — nothing was written to disk.', 'OK', { duration: 5000 });
        this.saveCancelled = true;
      }
      this.saveCompleted.emit({ outcome, submission });
    } catch (err) {
      console.error('Save failed', err);
      this.saveError = true;
    } finally {
      this.saving = false;
    }
  }
}
