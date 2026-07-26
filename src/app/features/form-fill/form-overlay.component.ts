import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  ViewChild,
  ViewChildren,
  QueryList,
  inject,
} from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { FormDefinition, FieldValues } from '../../core/models/form-definition.model';
import { FormField } from '../../core/models/form-field.model';
import { Client } from '../../core/models/client.model';
import { PdfRenderService, PageInfo } from './pdf-render.service';
import { toScreenRect, ScreenRect } from './field-geometry';
import { SignatureDialogComponent } from './signature-dialog.component';

interface PlacedField {
  field: FormField;
  screen: ScreenRect;
}

/** Shared empty result, so an unplaced page does not hand the template a new
 *  array identity on every change detection pass. */
const EMPTY_PLACEMENTS: PlacedField[] = [];

/**
 * Renders a form's source document and positions its fields on top.
 *
 * The document is the thing being signed, so it is rendered as-is and fields
 * sit over it at the coordinates the definition carries — nothing about the
 * page is re-laid-out or restyled.
 */
@Component({
  selector: 'app-form-overlay',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatDialogModule,
  ],
  // The document loads and draws asynchronously, so state changes land outside
  // any check Angular started. Making the checks explicit is what stops those
  // updates racing the cycle that is verifying them (NG0100).
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay-root" #host>
      <p class="status" *ngIf="loading">Loading document…</p>
      <p class="status error" *ngIf="error">{{ error }}</p>

      <div class="page" *ngFor="let page of pages" [style.width.px]="page.cssWidth">
        <canvas
          #pageCanvas
          class="page-canvas"
          [style.width.px]="page.cssWidth"
          [style.height.px]="page.cssHeight"
        ></canvas>

        <div
          *ngFor="let placed of placedOn(page.index); trackBy: trackField"
          class="field"
          [class.filled]="isFilled(placed.field)"
          [class.required-empty]="placed.field.required && !isFilled(placed.field)"
          [style.left.px]="placed.screen.left"
          [style.top.px]="placed.screen.top"
          [style.width.px]="placed.screen.width"
          [style.height.px]="placed.screen.height"
          [title]="placed.field.label"
        >
          <ng-container *ngIf="placed.field as field" [ngSwitch]="field.kind">
            <input
              *ngSwitchCase="'text'"
              [ngModel]="values[field.id]"
              (ngModelChange)="set(field, $event)"
              [attr.aria-label]="field.label"
              [attr.maxlength]="field.maxLength"
            />
            <input
              *ngSwitchCase="'date'"
              [ngModel]="values[field.id]"
              (ngModelChange)="set(field, $event)"
              [attr.aria-label]="field.label"
              placeholder="DD/MM/YYYY"
            />
            <textarea
              *ngSwitchCase="'multiline'"
              [ngModel]="values[field.id]"
              (ngModelChange)="set(field, $event)"
              [attr.aria-label]="field.label"
            ></textarea>
            <input
              *ngSwitchCase="'checkbox'"
              type="checkbox"
              [ngModel]="!!values[field.id]"
              (ngModelChange)="set(field, $event)"
              [attr.aria-label]="field.label"
            />
            <button
              *ngSwitchDefault
              type="button"
              class="sign-button"
              (click)="captureSignature(field)"
              [attr.aria-label]="field.label"
            >
              <img *ngIf="isFilled(field)" [src]="values[field.id]" alt="" />
              <span *ngIf="!isFilled(field)">
                <mat-icon>draw</mat-icon>
                {{ field.kind === 'initials' ? 'Initial' : 'Sign' }}
              </span>
            </button>
          </ng-container>
        </div>
      </div>

      <p class="status" *ngIf="!loading && !error && definition && !definition.fields.length">
        This document has no fields positioned on it yet, so there is nothing to fill in.
      </p>
    </div>
  `,
  styles: [`
    .overlay-root { display: flex; flex-direction: column; align-items: center; gap: 20px; }

    .status { color: var(--muted-foreground); font-size: 14px; margin: 8px 0; }
    .status.error { color: var(--destructive); }

    .page {
      position: relative;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      background: #fff;
      max-width: 100%;
    }
    .page-canvas { display: block; }

    /* Fields sit over the page, so they must not obscure the text under them. */
    .field { position: absolute; }
    .field input,
    .field textarea {
      width: 100%; height: 100%; box-sizing: border-box;
      border: 1px solid rgba(24,24,27,.28);
      border-radius: 3px;
      background: rgba(59,130,246,.07);
      font: inherit; font-size: 12px; padding: 1px 4px; margin: 0;
      color: var(--foreground);
    }
    .field input[type=checkbox] { width: 100%; height: 100%; accent-color: var(--primary); }
    .field textarea { resize: none; line-height: 1.25; }
    .field input:focus, .field textarea:focus {
      outline: 2px solid var(--ring); outline-offset: 1px; background: #fff;
    }
    .field.required-empty input,
    .field.required-empty textarea,
    .field.required-empty .sign-button { border-color: var(--destructive); }

    .sign-button {
      width: 100%; height: 100%; padding: 0; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 4px;
      border: 1px dashed rgba(24,24,27,.4); border-radius: 3px;
      background: rgba(59,130,246,.07); color: var(--muted-foreground);
      font: inherit; font-size: 11px;
    }
    .sign-button:hover { background: rgba(59,130,246,.14); }
    .sign-button img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .sign-button mat-icon { font-size: 15px; width: 15px; height: 15px; }
    .field.filled .sign-button { border-style: solid; background: transparent; }
  `],
})
export class FormOverlayComponent implements OnChanges, AfterViewInit {
  @Input() definition: FormDefinition | null = null;
  /** Pre-fills any field with a `bindTo` naming one of this client's properties. */
  @Input() client: Client | null = null;
  @Output() valuesChange = new EventEmitter<FieldValues>();
  /** True once every required field carries a value. */
  @Output() completeChange = new EventEmitter<boolean>();

  @ViewChild('host') host!: ElementRef<HTMLElement>;
  @ViewChildren('pageCanvas') canvases!: QueryList<ElementRef<HTMLCanvasElement>>;

  private renderer = inject(PdfRenderService);
  private dialog = inject(MatDialog);
  private cdr = inject(ChangeDetectorRef);

  pages: PageInfo[] = [];
  values: FieldValues = {};
  loading = false;
  error = '';

  private renderedFor: string | null = null;
  private doc: PDFDocumentProxy | null = null;

  ngOnChanges(): void {
    this.prefill();
    if (this.host) this.renderIfNeeded();
  }

  ngAfterViewInit(): void {
    this.renderIfNeeded();
    // Canvases appear only once `pages` has been rendered by the template, so
    // drawing is driven by that rather than by when the PDF finished loading.
    this.canvases.changes.subscribe(() => this.drawPages());
  }

  /** Fields bound to a client property start filled, as the wizard already does. */
  private prefill(): void {
    if (!this.definition) return;
    for (const field of this.definition.fields) {
      if (!field.bindTo || this.values[field.id] !== undefined) continue;
      const bound = this.client ? (this.client as unknown as Record<string, string>)[field.bindTo] : undefined;
      if (bound !== undefined) this.values[field.id] = bound;
      else if (field.defaultValue !== undefined) this.values[field.id] = field.defaultValue;
    }
    this.emit();
  }

  private async renderIfNeeded(): Promise<void> {
    const def = this.definition;
    if (!def?.document?.url) return;

    // Re-rendering the same document on every change detection pass would
    // discard the canvases the user is looking at.
    const key = `${def.id}@${def.version}`;
    if (this.renderedFor === key) return;
    this.renderedFor = key;

    this.loading = true;
    this.error = '';
    this.pages = [];

    try {
      this.doc = await this.renderer.load(def.document.url);
      const available = this.host.nativeElement.clientWidth || 900;
      const first = def.document.pages[0];
      const scale = this.renderer.fitScale(first?.width ?? 595, available);

      const described: PageInfo[] = [];
      for (let i = 0; i < this.doc.numPages; i++) {
        described.push(await this.renderer.describePage(this.doc, i, scale));
      }
      this.pages = described;
      this.computePlacements();
      this.loading = false;
      this.cdr.markForCheck();

      // If the canvases already exist (a re-render), nothing will fire
      // canvases.changes, so draw directly as well.
      queueMicrotask(() => this.drawPages());
    } catch (err) {
      this.loading = false;
      this.error = 'Could not load the document. It may be missing or unreadable.';
      this.cdr.markForCheck();
      console.error('FormD: failed to render form document', err);
    }
  }

  private async drawPages(): Promise<void> {
    if (!this.doc || !this.canvases) return;
    const elements = this.canvases.toArray();
    for (const info of this.pages) {
      const canvas = elements[info.index]?.nativeElement;
      if (!canvas || canvas.dataset['rendered'] === String(info.scale)) continue;
      await this.renderer.renderPageInto(this.doc, info, canvas);
      canvas.dataset['rendered'] = String(info.scale);
    }
  }

  /**
   * Fields with their screen positions already worked out, grouped by page.
   *
   * Computed once whenever the pages or the definition change rather than from
   * the template. Calling a method that filters an array and builds a rect
   * object from a binding runs it on every change detection pass — wasteful,
   * and the fresh identities each pass destabilise the loop enough to trip
   * NG0100 in development.
   */
  private placed = new Map<number, PlacedField[]>();

  private computePlacements(): void {
    this.placed = new Map();
    for (const page of this.pages) {
      const onPage = (this.definition?.fields ?? [])
        .filter((f) => f.rect.page === page.index)
        .map((field) => ({
          field,
          screen: toScreenRect(field.rect, page.pdfHeight, page.scale),
        }));
      this.placed.set(page.index, onPage);
    }
  }

  placedOn(pageIndex: number): PlacedField[] {
    return this.placed.get(pageIndex) ?? EMPTY_PLACEMENTS;
  }

  trackField(_index: number, placed: PlacedField): string {
    return placed.field.id;
  }

  isFilled(field: FormField): boolean {
    const v = this.values[field.id];
    return v !== undefined && v !== '' && v !== false;
  }

  set(field: FormField, value: string | boolean): void {
    this.values = { ...this.values, [field.id]: value };
    this.cdr.markForCheck();
    this.emit();
  }

  async captureSignature(field: FormField): Promise<void> {
    const result = await this.dialog
      .open(SignatureDialogComponent, { data: { label: field.label } })
      .afterClosed()
      .toPromise();
    if (result) this.set(field, result);
  }

  /**
   * Notifies the parent of new values.
   *
   * prefill() runs inside ngOnChanges, so emitting there updates a parent
   * binding mid-cycle — NG0100 (ExpressionChangedAfterItHasBeenChecked).
   *
   * setTimeout rather than queueMicrotask: a microtask still drains inside the
   * same change detection tick, so the parent is still updated during the
   * cycle that is checking it. A macrotask schedules a fresh cycle, which is
   * what makes the update an ordinary one.
   */
  private emit(): void {
    setTimeout(() => {
      this.valuesChange.emit(this.values);
      const required = (this.definition?.fields ?? []).filter((f) => f.required);
      this.completeChange.emit(required.every((f) => this.isFilled(f)));
    });
  }
}
