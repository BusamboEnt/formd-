import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatStepperModule, MatStepper } from '@angular/material/stepper';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { Client } from '../../core/models/client.model';
import { ClientSearchComponent } from './steps/client-search/client-search.component';
import { FormPreviewComponent } from './steps/form-preview/form-preview.component';
import { SignatureStepComponent } from './steps/signature-step/signature-step.component';
import { ConfirmationComponent } from './steps/confirmation/confirmation.component';

@Component({
  selector: 'app-wizard',
  standalone: true,
  imports: [
    CommonModule,
    MatStepperModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    ClientSearchComponent,
    FormPreviewComponent,
    SignatureStepComponent,
    ConfirmationComponent,
  ],
  template: `
    <div class="wizard-container">
      <mat-card class="wizard-card">
        <mat-card-content>
      <mat-stepper
        #stepper
        [linear]="true"
        orientation="horizontal"
        animationDuration="300"
      >
        <!-- Completed steps should read as done, not as "editable" -->
        <ng-template matStepperIcon="edit"><mat-icon>check</mat-icon></ng-template>
        <ng-template matStepperIcon="done"><mat-icon>check</mat-icon></ng-template>

        <!-- Step 1: Client Search -->
        <mat-step [completed]="!!selectedClient" label="Find Client">
          <app-client-search
            (clientSelected)="onClientSelected($event)"
          ></app-client-search>
          <div class="step-nav">
            <button
              mat-raised-button
              color="primary"
              [disabled]="!selectedClient"
              matStepperNext
            >
              Next <mat-icon>arrow_forward</mat-icon>
            </button>
          </div>
        </mat-step>

        <!-- Step 2: Form Preview -->
        <mat-step [completed]="!!selectedClient" label="Review Form">
          <app-form-preview [client]="selectedClient"></app-form-preview>
          <div class="step-nav">
            <button mat-stroked-button matStepperPrevious>
              <mat-icon>arrow_back</mat-icon> Back
            </button>
            <button
              mat-raised-button
              color="primary"
              [disabled]="!selectedClient"
              matStepperNext
            >
              Proceed to Sign <mat-icon>arrow_forward</mat-icon>
            </button>
          </div>
        </mat-step>

        <!-- Step 3: Signature -->
        <mat-step [completed]="!!signatureDataUrl" label="Sign">
          <app-signature-step
            [client]="selectedClient"
            (signatureChange)="onSignatureChange($event)"
          ></app-signature-step>
          <div class="step-nav">
            <button mat-stroked-button matStepperPrevious>
              <mat-icon>arrow_back</mat-icon> Back
            </button>
            <button
              mat-raised-button
              color="primary"
              [disabled]="!signatureDataUrl"
              matStepperNext
            >
              Review & Save <mat-icon>arrow_forward</mat-icon>
            </button>
          </div>
        </mat-step>

        <!-- Step 4: Confirmation -->
        <mat-step label="Save">
          <app-confirmation
            [client]="selectedClient"
            [signatureDataUrl]="signatureDataUrl"
          ></app-confirmation>
          <div class="step-nav">
            <button mat-stroked-button matStepperPrevious>
              <mat-icon>arrow_back</mat-icon> Back
            </button>
            <button mat-raised-button color="accent" (click)="reset(stepper)">
              <mat-icon>refresh</mat-icon> New Agreement
            </button>
          </div>
        </mat-step>
      </mat-stepper>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .wizard-container {
      max-width: 900px;
      margin: 24px auto;
      padding: 0 16px;
      overflow-x: hidden;
    }
    .wizard-card {
      padding: 8px;
    }
    .step-nav {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
    }
    mat-stepper { background: transparent; }
    @media (max-width: 600px) {
      .wizard-container { margin: 8px auto; padding: 0 8px; }
      .wizard-card { padding: 0; }
    }
  `],
})
export class WizardComponent {
  @ViewChild('stepper') stepper!: MatStepper;
  @ViewChild(ClientSearchComponent) clientSearchRef!: ClientSearchComponent;

  selectedClient: Client | null = null;
  signatureDataUrl: string | null = null;

  onClientSelected(client: Client | null): void {
    this.selectedClient = client;
    this.signatureDataUrl = null;
  }

  onSignatureChange(dataUrl: string | null): void {
    this.signatureDataUrl = dataUrl;
  }

  reset(stepper: MatStepper): void {
    this.selectedClient = null;
    this.signatureDataUrl = null;
    stepper.reset();
    this.clientSearchRef?.reset();
  }
}
