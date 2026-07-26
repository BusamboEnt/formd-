import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Client } from '../../../../core/models/client.model';

@Component({
  selector: 'app-form-preview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="step-content">
      <h2 class="step-title">Review Agreement</h2>
      <p class="step-subtitle">Please review the service agreement below before signing.</p>

      <div class="form-document" id="form-document" *ngIf="client">
        <div class="doc-header">
          <div class="doc-logo">FormD</div>
          <div class="doc-meta">
            <div><strong>Reference:</strong> {{ client.referenceNumber }}</div>
            <div><strong>Date:</strong> {{ today }}</div>
          </div>
        </div>

        <h1 class="doc-title">SERVICE AGREEMENT</h1>

        <section class="doc-section">
          <h3>Parties</h3>
          <p>
            This Service Agreement ("Agreement") is entered into as of <strong>{{ today }}</strong>
            between <strong>FormD Services (Pty) Ltd</strong> ("Service Provider") and:
          </p>
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

        <section class="doc-section">
          <h3>1. Services</h3>
          <p>
            The Service Provider agrees to deliver the services as described in the attached
            schedule of services, in accordance with the terms and conditions set forth in
            this Agreement.
          </p>
        </section>

        <section class="doc-section">
          <h3>2. Payment Terms</h3>
          <p>
            Client agrees to pay the Service Provider the agreed fees within 30 (thirty)
            days of invoice. Late payments will incur a penalty of 2% per month on the
            outstanding balance.
          </p>
        </section>

        <section class="doc-section">
          <h3>3. Term & Termination</h3>
          <p>
            This Agreement commences on the date of signing and remains in effect for
            12 (twelve) months, unless terminated earlier by either party with 30 days'
            written notice.
          </p>
        </section>

        <section class="doc-section">
          <h3>4. Confidentiality</h3>
          <p>
            Both parties agree to keep all confidential information disclosed during the
            term of this Agreement strictly confidential and not to disclose it to any
            third party without prior written consent.
          </p>
        </section>

        <section class="doc-section">
          <h3>5. Governing Law</h3>
          <p>
            This Agreement shall be governed by and construed in accordance with the laws
            of the Republic of South Africa.
          </p>
        </section>

        <div class="doc-footer">
          <p>Reference No: {{ client.referenceNumber }} &nbsp;|&nbsp; Generated: {{ today }}</p>
        </div>
      </div>

      <div *ngIf="!client" class="no-client">
        <p>No client selected. Please go back and select a client.</p>
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

  today = new Date().toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  ngOnChanges(): void {
    this.today = new Date().toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}
