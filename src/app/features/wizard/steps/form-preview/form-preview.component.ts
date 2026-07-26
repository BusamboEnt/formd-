import { Component, Input, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Client } from '../../../../core/models/client.model';
import { FORMD_AGREEMENT } from '../../../../core/config/formd.config';
import { FORMD_BRANDING, FORMD_COPY, fill } from '../../../../core/config/formd.copy';

@Component({
  selector: 'app-form-preview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="step-content">
      <h2 class="step-title">{{ copy.formPreview.title }}</h2>
      <p class="step-subtitle">{{ copy.formPreview.subtitle }}</p>

      <div class="form-document" id="form-document" *ngIf="client">
        <div class="doc-header">
          <div class="doc-logo" *ngIf="branding.showInDocument">{{ branding.name }}</div>
          <div class="doc-meta">
            <div><strong>{{ copy.formPreview.referenceLabel }}</strong> {{ client.referenceNumber }}</div>
            <div><strong>{{ copy.formPreview.dateLabel }}</strong> {{ today }}</div>
          </div>
        </div>

        <h1 class="doc-title">{{ agreement.title }}</h1>

        <section class="doc-section">
          <h3>{{ copy.formPreview.partiesHeading }}</h3>
          <p>{{ preambleText }}</p>
          <table class="client-table">
            <tr>
              <td><strong>Full Name:</strong></td>
              <td>{{ client.name }}</td>
            </tr>
            <tr *ngIf="client.companyName">
              <td><strong>Company:</strong></td>
              <td>{{ client.companyName }}</td>
            </tr>
            <tr>
              <td><strong>Address:</strong></td>
              <td>{{ client.address }}, {{ client.city }}, {{ client.postalCode }}</td>
            </tr>
            <tr>
              <td><strong>Email:</strong></td>
              <td>{{ client.email }}</td>
            </tr>
            <tr>
              <td><strong>Phone:</strong></td>
              <td>{{ client.phone }}</td>
            </tr>
          </table>
        </section>

        <section class="doc-section" *ngFor="let clause of agreement.clauses">
          <h3>{{ clause.heading }}</h3>
          <p>{{ clause.body }}</p>
        </section>

        <div class="doc-footer">
          <p>
            Reference No: {{ client.referenceNumber }} &nbsp;|&nbsp;
            Generated: {{ today }} &nbsp;|&nbsp;
            Agreement v{{ agreement.version }}
          </p>
        </div>
      </div>

      <div *ngIf="!client" class="no-client">
        <p>{{ copy.formPreview.noClient }}</p>
      </div>
    </div>
  `,
  styles: [`
    .step-content { padding: 8px 0; }
    .step-title { margin: 0 0 4px; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
    .step-subtitle { margin: 0 0 24px; color: var(--muted-foreground); }

    .form-document {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 32px 40px;
      background: #fff;
      font-family: 'Times New Roman', Times, serif;
      font-size: 14px;
      line-height: 1.6;
      color: var(--foreground);
      max-width: 760px;
      margin: 0 auto;
    }

    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
      margin-bottom: 20px;
    }

    .doc-logo {
      font-family: Inter, sans-serif;
      font-size: 20px;
      font-weight: 800;
      color: var(--foreground);
      letter-spacing: 2px;
    }

    .doc-meta { text-align: right; font-size: 13px; }
    .doc-meta div { margin-bottom: 4px; }

    .doc-title {
      text-align: center;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 2px;
      margin: 16px 0 24px;
      text-decoration: underline;
    }

    .doc-section { margin-bottom: 20px; }
    .doc-section h3 { font-size: 15px; font-weight: 700; margin-bottom: 8px; }

    .client-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    .client-table td { padding: 5px 8px; vertical-align: top; }
    .client-table td:first-child { width: 140px; white-space: nowrap; }

    .doc-footer {
      border-top: 1px solid var(--border);
      padding-top: 12px;
      margin-top: 24px;
      font-size: 11px;
      color: var(--muted-foreground);
      text-align: center;
    }

    .no-client { color: var(--muted-foreground); padding: 24px; text-align: center; }
  `],
})
export class FormPreviewComponent implements OnChanges {
  @Input() client: Client | null = null;

  readonly agreement = inject(FORMD_AGREEMENT);
  readonly copy = inject(FORMD_COPY);
  readonly branding = inject(FORMD_BRANDING);

  today = new Date().toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  get preambleText(): string {
    return fill(this.copy.formPreview.preamble, {
      date: this.today,
      provider: this.agreement.provider,
    });
  }

  ngOnChanges(): void {
    this.today = new Date().toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}
