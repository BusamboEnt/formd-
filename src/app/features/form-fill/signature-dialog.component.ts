import { Component, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { SignaturePadComponent } from '../../shared/components/signature-pad/signature-pad.component';
import { FORMD_COPY } from '../../core/config/formd.copy';

/**
 * Captures a signature for one field.
 *
 * A field box on a document can be 60 points tall, which is far too small to
 * sign into. The pad opens at a usable size and the result is scaled back into
 * the box when it is stamped.
 */
@Component({
  selector: 'app-signature-dialog',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatDialogModule, SignaturePadComponent],
  template: `
    <h2 mat-dialog-title>{{ data.label }}</h2>
    <mat-dialog-content>
      <app-signature-pad
        style="display:block;width:100%;"
        (signatureChange)="captured = $event"
      ></app-signature-pad>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" [disabled]="!captured" (click)="apply()">
        Apply
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { min-width: min(560px, 80vw); }
  `],
})
export class SignatureDialogComponent {
  readonly data = inject<{ label: string }>(MAT_DIALOG_DATA);
  readonly copy = inject(FORMD_COPY);
  private ref = inject(MatDialogRef<SignatureDialogComponent>);

  captured: string | null = null;

  apply(): void {
    this.ref.close(this.captured);
  }
}
