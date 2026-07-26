import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  ViewChild,
  ViewContainerRef,
  inject,
} from '@angular/core';
import { NgIf } from '@angular/common';
import { WizardComponent } from '../features/wizard/wizard.component';
import { AgreementTemplate } from '../core/models/agreement.model';
import { FormSubmission } from '../core/models/form-submission.model';
import { ClientSource, SaveHandler, SaveOutcome } from '../core/config/formd.config';
import {
  DeepPartial,
  DEFAULT_BRANDING,
  FormdBranding,
  FormdCopy,
  mergeCopy,
} from '../core/config/formd.copy';
import { FormdRuntime } from './formd-runtime';

/**
 * Host component behind the `<formd-wizard>` custom element.
 *
 * Configuration arrives as DOM properties rather than through DI, so incoming
 * values are written into FormdRuntime and the wizard is torn down and rebuilt
 * to pick them up — the injection tokens resolve once per component instance,
 * so reusing the old instance would silently keep the previous config.
 */
@Component({
  selector: 'formd-wizard-host',
  standalone: true,
  imports: [NgIf, WizardComponent],
  template: `
    <ng-container *ngIf="ready">
      <!-- A form id selects the document-backed flow: render the client's own
           PDF and sign it in place. Without one, the clause wizard. -->
      <ng-container #formHost></ng-container>
      <app-wizard
        *ngIf="!formId"
        (saveCompleted)="onSaveCompleted($event)"
      ></app-wizard>
    </ng-container>
  `,
})
export class FormdElementComponent implements OnChanges {
  /** Contract text to present and record. Falls back to the bundled sample. */
  @Input() agreement?: AgreementTemplate;
  /** Supplies client records to the search step. */
  @Input() clientSource?: ClientSource;
  /** Receives the signed record. Falls back to writing PNG + JSON locally. */
  @Input() saveHandler?: SaveHandler;
  /** Brand mark and tagline. Partial — unset fields keep their defaults. */
  @Input() branding?: Partial<FormdBranding>;
  /** User-facing strings. Partial at the group level. */
  @Input() copy?: DeepPartial<FormdCopy>;
  /**
   * Id of an imported form. Set it to fill and sign that document instead of
   * presenting the clause agreement.
   */
  @Input() formId?: string;
  /** Backend holding the form, implementing backend/openapi.yaml. */
  @Input() apiBaseUrl = '';

  /** Emitted as the `saved` DOM event once a record is persisted. */
  @Output() saved = new EventEmitter<FormSubmission>();
  /** Emitted as the `cancelled` DOM event when a save was abandoned. */
  @Output() cancelled = new EventEmitter<FormSubmission>();

  @ViewChild('formHost', { read: ViewContainerRef }) formHost?: ViewContainerRef;

  private runtime = inject(FormdRuntime);
  private cdr = inject(ChangeDetectorRef);

  ready = false;
  private mountedFormId?: string;

  ngOnChanges(): void {
    if (this.agreement) this.runtime.agreement = this.agreement;
    this.runtime.clientSource = this.clientSource ?? null;
    this.runtime.saveHandler = this.saveHandler ?? null;
    this.runtime.branding = { ...DEFAULT_BRANDING, ...this.branding };
    this.runtime.copy = mergeCopy(this.copy);

    // Drop and re-create so freshly injected tokens see the new config.
    this.ready = false;
    this.mountedFormId = undefined;
    this.cdr.detectChanges();
    this.ready = true;
    this.cdr.detectChanges();

    void this.mountFormFill();
  }

  /**
   * Creates the document-backed flow on demand.
   *
   * Imported dynamically for the same reason the app shell does it: this pulls
   * in pdf.js and the overlay, which a host only presenting the clause
   * agreement should not download.
   */
  private async mountFormFill(): Promise<void> {
    if (!this.formId || !this.formHost) return;
    if (this.mountedFormId === this.formId) return;

    this.mountedFormId = this.formId;
    this.formHost.clear();

    const { FormFillComponent } = await import('../features/form-fill/form-fill.component');
    const ref = this.formHost.createComponent(FormFillComponent);
    ref.setInput('formId', this.formId);
    ref.setInput('apiBaseUrl', this.apiBaseUrl);
    this.cdr.markForCheck();
  }

  onSaveCompleted({ outcome, submission }: { outcome: SaveOutcome; submission: FormSubmission }): void {
    (outcome === 'saved' ? this.saved : this.cancelled).emit(submission);
  }
}
