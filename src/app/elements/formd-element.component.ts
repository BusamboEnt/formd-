import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
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
    <app-wizard *ngIf="ready" (saveCompleted)="onSaveCompleted($event)"></app-wizard>
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

  /** Emitted as the `saved` DOM event once a record is persisted. */
  @Output() saved = new EventEmitter<FormSubmission>();
  /** Emitted as the `cancelled` DOM event when a save was abandoned. */
  @Output() cancelled = new EventEmitter<FormSubmission>();

  private runtime = inject(FormdRuntime);
  private cdr = inject(ChangeDetectorRef);

  ready = false;

  ngOnChanges(): void {
    if (this.agreement) this.runtime.agreement = this.agreement;
    this.runtime.clientSource = this.clientSource ?? null;
    this.runtime.saveHandler = this.saveHandler ?? null;
    this.runtime.branding = { ...DEFAULT_BRANDING, ...this.branding };
    this.runtime.copy = mergeCopy(this.copy);

    // Drop and re-create so freshly injected tokens see the new config.
    this.ready = false;
    this.cdr.detectChanges();
    this.ready = true;
  }

  onSaveCompleted({ outcome, submission }: { outcome: SaveOutcome; submission: FormSubmission }): void {
    (outcome === 'saved' ? this.saved : this.cancelled).emit(submission);
  }
}
