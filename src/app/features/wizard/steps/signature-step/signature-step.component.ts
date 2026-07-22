import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { SignaturePadComponent } from '../../../../shared/components/signature-pad/signature-pad.component';
import { Client } from '../../../../core/models/client.model';

@Component({
  selector: 'app-signature-step',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, SignaturePadComponent],
  template: `
    <div class="step-content">
      <h2 class="step-title">Client Signature</h2>
      <p class="step-subtitle" *ngIf="client">
        Please hand the device to <strong>{{ client.name }}</strong> to sign below.
      </p>

      <mat-card appearance="outlined" class="sig-card">
        <mat-card-content>
          <p class="instruction">
            <mat-icon>draw</mat-icon>
            Draw your signature in the box below using your finger or stylus.
          </p>
          <app-signature-pad
            style="height: 180px; display: block;"
            (signatureChange)="onSignatureChange($event)"
          ></app-signature-pad>
        </mat-card-content>
      </mat-card>

      <p class="sig-status" [class.signed]="signatureDataUrl" [class.unsigned]="!signatureDataUrl">
        <mat-icon>{{ signatureDataUrl ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
        {{ signatureDataUrl ? 'Signature captured' : 'Signature required to proceed' }}
      </p>
    </div>
  `,
  styles: [`
    .step-content { padding: 8px 0; }
    .step-title { margin: 0 0 4px; font-size: 22px; font-weight: 600; }
    .step-subtitle { margin: 0 0 24px; color: #444; }
    .sig-card { margin-bottom: 16px; }
    .instruction {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #555;
      margin-bottom: 16px;
      font-size: 14px;
    }
    .sig-status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      margin: 0;
    }
    .signed { color: #2e7d32; }
    .unsigned { color: #b71c1c; }
  `],
})
export class SignatureStepComponent {
  @Input() client: Client | null = null;
  @Output() signatureChange = new EventEmitter<string | null>();

  signatureDataUrl: string | null = null;

  onSignatureChange(dataUrl: string | null): void {
    this.signatureDataUrl = dataUrl;
    this.signatureChange.emit(dataUrl);
  }
}
