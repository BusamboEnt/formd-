import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { SignaturePadComponent } from '../../../../shared/components/signature-pad/signature-pad.component';
import { Client } from '../../../../core/models/client.model';
import { FORMD_COPY, fill } from '../../../../core/config/formd.copy';

@Component({
  selector: 'app-signature-step',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, SignaturePadComponent],
  template: `
    <div class="step-content">
      <h2 class="step-title">{{ copy.signature.title }}</h2>
      <p class="step-subtitle" *ngIf="client">{{ subtitleText }}</p>

      <mat-card appearance="outlined" class="sig-card">
        <mat-card-content>
          <p class="instruction">
            <mat-icon>draw</mat-icon>
            {{ copy.signature.instruction }}
          </p>
          <app-signature-pad
            style="display: block; width: 100%;"
            (signatureChange)="onSignatureChange($event)"
          ></app-signature-pad>
        </mat-card-content>
      </mat-card>

      <p class="sig-status" [class.signed]="signatureDataUrl" [class.unsigned]="!signatureDataUrl">
        <mat-icon>{{ signatureDataUrl ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
        {{ signatureDataUrl ? copy.signature.captured : copy.signature.required }}
      </p>
    </div>
  `,
  styles: [`
    .step-content { padding: 8px 0; }
    .step-title { margin: 0 0 4px; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
    .step-subtitle { margin: 0 0 24px; color: var(--muted-foreground); }
    .sig-card { margin-bottom: 16px; }
    .instruction {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--muted-foreground);
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
    .signed { color: var(--success); }
    .unsigned { color: var(--destructive); }
  `],
})
export class SignatureStepComponent {
  @Input() client: Client | null = null;
  @Output() signatureChange = new EventEmitter<string | null>();

  readonly copy = inject(FORMD_COPY);

  signatureDataUrl: string | null = null;

  get subtitleText(): string {
    return fill(this.copy.signature.subtitle, { client: this.client?.name ?? '' });
  }

  onSignatureChange(dataUrl: string | null): void {
    this.signatureDataUrl = dataUrl;
    this.signatureChange.emit(dataUrl);
  }
}
