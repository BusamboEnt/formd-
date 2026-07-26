import {
  Component,
  ElementRef,
  Input,
  OnChanges,
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
import { FormSaveService } from '../../../../core/services/form-save.service';

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
            <span class="preview-ref">{{ client.referenceNumber }} | {{ today }}</span>
          </div>
          <h2 class="preview-title">SERVICE AGREEMENT</h2>
          <table class="preview-table">
            <tr><td>Client:</td><td><strong>{{ client.name }}</strong></td></tr>
            <tr *ngIf="client.companyName"><td>Company:</td><td>{{ client.companyName }}</td></tr>
            <tr><td>Address:</td><td>{{ client.address }}, {{ client.city }}</td></tr>
            <tr><td>Email:</td><td>{{ client.email }}</td></tr>
            <tr><td>Phone:</td><td>{{ client.phone }}</td></tr>
          </table>
          <p class="preview-terms">
            I, the undersigned, confirm that I have read, understood, and agree to the terms
            and conditions of this Service Agreement as set forth by FormD Services (Pty) Ltd.
          </p>
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
    .step-title { margin: 0 0 4px; font-size: 22px; font-weight: 600; }
    .step-subtitle { margin: 0 0 24px; color: #666; }

    .preview-wrapper {
      border: 1px solid #ddd;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 24px;
    }

    .preview-doc {
      background: #fff;
      padding: 28px 36px;
      font-family: 'Times New Roman', Times, serif;
      font-size: 13px;
      line-height: 1.5;
      color: #222;
    }

    .preview-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #3f51b5;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }

    .preview-logo { font-size: 22px; font-weight: 800; color: #3f51b5; letter-spacing: 2px; }
    .preview-ref { font-size: 12px; color: #666; }

    .preview-title {
      text-align: center;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 2px;
      text-decoration: underline;
      margin: 0 0 16px;
    }

    .preview-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    .preview-table td { padding: 4px 8px; }
    .preview-table td:first-child { width: 100px; color: #555; }

    .preview-terms {
      font-size: 12px;
      font-style: italic;
      color: #444;
      border: 1px solid #eee;
      padding: 10px 14px;
      border-radius: 4px;
      margin-bottom: 20px;
    }

    .sig-section { display: flex; justify-content: flex-end; }

    .sig-block { width: 260px; text-align: center; }
    .sig-image { max-width: 100%; height: 80px; object-fit: contain; }
    .sig-line { border-bottom: 1px solid #333; margin: 4px 0; }
    .sig-label { font-size: 12px; margin: 4px 0 2px; }
    .sig-date { font-size: 11px; color: #666; margin: 0; }

    .save-actions {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
    }

    .save-error {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #b71c1c;
      margin-top: 8px;
    }

    .save-success {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #2e7d32;
    }
    .success-icon { font-size: 28px; width: 28px; height: 28px; }

    .missing-data {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #b71c1c;
    }
  `],
})
export class ConfirmationComponent implements OnChanges {
  @Input() client: Client | null = null;
  @Input() signatureDataUrl: string | null = null;
  @ViewChild('previewEl') previewEl!: ElementRef<HTMLElement>;

  private formSave = inject(FormSaveService);
  private snackBar = inject(MatSnackBar);

  today = '';
  saving = false;
  saved = false;
  saveError = false;

  ngOnChanges(): void {
    this.saved = false;
    this.saving = false;
    this.saveError = false;
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

    const submission: FormSubmission = {
      client: this.client,
      formDate: this.today,
      agreementTitle: 'Service Agreement',
      agreementBody: 'Standard service agreement terms accepted.',
      signatureDataUrl: this.signatureDataUrl,
      savedAt: new Date().toISOString(),
    };

    try {
      await this.formSave.saveAll(this.previewEl.nativeElement, submission);
      this.snackBar.open('Agreement saved successfully!', 'OK', { duration: 4000, panelClass: 'snack-success' });
      this.saved = true;
    } catch (err) {
      console.error('Save failed', err);
      this.saveError = true;
    } finally {
      this.saving = false;
    }
  }
}
