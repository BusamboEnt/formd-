import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnChanges,
  QueryList,
  ViewChild,
  ViewChildren,
  inject,
} from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FormDefinition } from '../../core/models/form-definition.model';
import { FieldKind, FormField } from '../../core/models/form-field.model';
import { PdfRenderService, PageInfo } from '../form-fill/pdf-render.service';
import { toPdfRect, toScreenRect, ScreenRect } from '../form-fill/field-geometry';

interface PlacedField {
  field: FormField;
  screen: ScreenRect;
}

/** Shared empty result, so an empty page hands the template a stable identity. */
const EMPTY: PlacedField[] = [];

/** A drag in progress, in CSS pixels relative to its page. */
interface Draft extends ScreenRect {
  page: number;
}

const KINDS: { kind: FieldKind; label: string; icon: string }[] = [
  { kind: 'text', label: 'Text', icon: 'short_text' },
  { kind: 'multiline', label: 'Paragraph', icon: 'notes' },
  { kind: 'date', label: 'Date', icon: 'event' },
  { kind: 'checkbox', label: 'Checkbox', icon: 'check_box' },
  { kind: 'signature', label: 'Signature', icon: 'draw' },
  { kind: 'initials', label: 'Initials', icon: 'gesture' },
];

/** Below this a drag is a click, not an attempt to draw a box. */
const MIN_DRAG = 8;

/** Inspector column, its gap, and the card padding, in CSS pixels. */
const INSPECTOR_ALLOWANCE = 320;

/**
 * Places fields on a document by drawing them on the page.
 *
 * The alternative was hand-writing rectangles in PDF user space, where the
 * origin is the bottom-left — the one convention nobody has intuitions about.
 * Drawing the box is the same information, entered in the space the person is
 * actually looking at, and field-geometry does the flip once on the way out.
 *
 * Deliberately a separate component from the overlay rather than a mode of it:
 * the overlay is what a client sees while signing, and adding an editing mode
 * to it would put authoring controls one boolean away from the signing screen.
 */
@Component({
  selector: 'app-field-designer',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatCardModule, MatSnackBarModule],
  // The document loads and draws asynchronously, so state lands outside any
  // check Angular started — same reason the overlay is OnPush.
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- #host is deliberately out here rather than on the page column. It is
         what the render scale is measured against, and an element inside
         *ngIf="definition" does not exist at the moment the definition
         arrives — so rendering measured nothing and drew no pages at all. -->
    <div class="designer" #host>
      <mat-card class="panel">
        <mat-card-content>
          <header class="head">
            <div>
              <h2>{{ definition?.title || 'Place fields' }}</h2>
              <p *ngIf="definition">
                {{ fields.length }} field(s) · version {{ definition.version }}
                <span *ngIf="dirty" class="dirty">· unsaved</span>
              </p>
            </div>
            <div class="head-actions">
              <button mat-stroked-button type="button" [disabled]="!dirty || saving" (click)="revert()">
                Revert
              </button>
              <button
                mat-raised-button color="primary" type="button"
                [disabled]="!definition || !dirty || saving" (click)="save()"
              >
                <mat-icon>save</mat-icon>
                {{ saving ? 'Saving…' : 'Save fields' }}
              </button>
            </div>
          </header>

          <p class="loading" *ngIf="!definition && !loadError">Loading document…</p>
          <p class="error" *ngIf="loadError">{{ loadError }}</p>

          <div class="tools" *ngIf="definition">
            <span class="tools-label">Drag on the page to place:</span>
            <button
              *ngFor="let k of kinds"
              type="button" class="tool" [class.active]="kind === k.kind"
              [attr.aria-pressed]="kind === k.kind" (click)="kind = k.kind"
            >
              <mat-icon>{{ k.icon }}</mat-icon>{{ k.label }}
            </button>
          </div>

          <div class="stage" *ngIf="definition">
            <div class="pages">
              <div
                class="page" *ngFor="let page of pages"
                [style.width.px]="page.cssWidth"
                (pointerdown)="onPointerDown($event, page)"
              >
                <canvas
                  #pageCanvas class="page-canvas"
                  [style.width.px]="page.cssWidth" [style.height.px]="page.cssHeight"
                ></canvas>

                <div
                  *ngFor="let placed of placedOn(page.index); trackBy: trackField"
                  class="box" [class.selected]="placed.field.id === selectedId"
                  [style.left.px]="placed.screen.left" [style.top.px]="placed.screen.top"
                  [style.width.px]="placed.screen.width" [style.height.px]="placed.screen.height"
                  [title]="placed.field.label"
                >
                  <span class="box-tag">{{ placed.field.label || placed.field.id }}</span>
                </div>

                <div
                  class="box draft" *ngIf="draft && draft.page === page.index"
                  [style.left.px]="draft.left" [style.top.px]="draft.top"
                  [style.width.px]="draft.width" [style.height.px]="draft.height"
                ></div>
              </div>
            </div>

            <aside class="inspector">
              <ng-container *ngIf="selected() as field; else noSelection">
                <h3>Field</h3>
                <label>Key
                  <input [ngModel]="field.id" (ngModelChange)="rename(field, $event)" />
                </label>
                <p class="hint">
                  Answers are filed under this. Renaming it orphans anything already collected.
                </p>
                <label>Label
                  <input [ngModel]="field.label" (ngModelChange)="edit(field, { label: $event })" />
                </label>
                <label>Type
                  <select [ngModel]="field.kind" (ngModelChange)="edit(field, { kind: $event })">
                    <option *ngFor="let k of kinds" [value]="k.kind">{{ k.label }}</option>
                  </select>
                </label>
                <label>Pre-fill from client
                  <select
                    [ngModel]="field.bindTo || ''"
                    (ngModelChange)="edit(field, { bindTo: $event || undefined })"
                  >
                    <option value="">Entered by hand</option>
                    <option *ngFor="let p of bindable" [value]="p">{{ p }}</option>
                  </select>
                </label>
                <label class="check">
                  <input
                    type="checkbox" [ngModel]="!!field.required"
                    (ngModelChange)="edit(field, { required: $event })"
                  />
                  Required
                </label>
                <p class="hint">
                  Position: {{ field.rect.width | number: '1.0-0' }}×{{ field.rect.height | number: '1.0-0' }}
                  at {{ field.rect.x | number: '1.0-0' }},{{ field.rect.y | number: '1.0-0' }}
                  on page {{ field.rect.page + 1 }}
                </p>
                <button mat-stroked-button color="warn" type="button" (click)="remove(field)">
                  <mat-icon>delete</mat-icon> Remove field
                </button>
              </ng-container>
              <ng-template #noSelection>
                <h3>No field selected</h3>
                <p class="hint">
                  Drag anywhere on the document to place a
                  {{ kindLabel(kind) | lowercase }} field, or click one you have already placed to
                  edit it.
                </p>
              </ng-template>
            </aside>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .designer { max-width: 1200px; margin: 24px auto; padding: 0 16px; }
    .head {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
      flex-wrap: wrap; margin-bottom: 16px; padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    .head h2 { margin: 0 0 2px; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
    .head p { margin: 0; color: var(--muted-foreground); font-size: 13px; }
    .head-actions { display: flex; gap: 8px; }
    .dirty { color: var(--destructive); }
    .loading { color: var(--muted-foreground); }
    .error { color: var(--destructive); }

    .tools { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
    .tools-label { font-size: 13px; color: var(--muted-foreground); margin-right: 4px; }
    .tool {
      display: inline-flex; align-items: center; gap: 5px;
      font: inherit; font-size: 13px; padding: 6px 11px; cursor: pointer;
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      background: var(--background); color: var(--foreground);
    }
    .tool:hover { background: var(--muted); }
    .tool:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
    .tool.active { background: var(--primary); color: var(--primary-foreground); border-color: var(--primary); }
    .tool mat-icon { font-size: 16px; width: 16px; height: 16px; }

    .stage { display: flex; gap: 20px; align-items: flex-start; }
    .pages { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 20px; min-width: 0; }
    .page {
      position: relative; max-width: 100%; background: #fff; overflow: hidden;
      border: 1px solid var(--border); border-radius: var(--radius);
      /* The whole page is a drawing surface, so the browser must not start a
         text selection or a pan gesture when a drag begins on it. */
      cursor: crosshair; user-select: none; touch-action: none;
    }
    .page-canvas { display: block; pointer-events: none; }

    .box {
      position: absolute; box-sizing: border-box;
      border: 1px solid rgba(24,24,27,.5); background: rgba(59,130,246,.12);
      border-radius: 3px; cursor: pointer;
    }
    .box.selected { border: 2px solid var(--ring); background: rgba(59,130,246,.2); }
    .box.draft { border-style: dashed; pointer-events: none; }
    .box-tag {
      position: absolute; top: -17px; left: -1px; white-space: nowrap;
      font-size: 10px; line-height: 1; padding: 3px 5px; border-radius: 3px;
      background: var(--primary); color: var(--primary-foreground); pointer-events: none;
    }

    .inspector {
      width: 260px; flex: none; display: flex; flex-direction: column; gap: 12px;
      padding: 16px; border: 1px solid var(--border); border-radius: var(--radius);
      background: var(--card); position: sticky; top: 16px;
    }
    .inspector h3 { margin: 0; font-size: 14px; font-weight: 600; }
    .inspector label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 500; }
    .inspector label.check { flex-direction: row; align-items: center; gap: 8px; }
    .inspector input:not([type=checkbox]), .inspector select {
      font: inherit; font-size: 13px; padding: 6px 8px; color: var(--foreground);
      border: 1px solid var(--input); border-radius: var(--radius-sm); background: var(--background);
    }
    .inspector .hint { margin: 0; font-size: 11px; line-height: 1.45; color: var(--muted-foreground); }

    @media (max-width: 900px) {
      .stage { flex-direction: column; }
      .inspector { width: 100%; position: static; }
    }
  `],
})
export class FieldDesignerComponent implements OnChanges, AfterViewInit {
  /** Which stored form to place fields on. */
  @Input() formId = '';
  /** Backend implementing backend/openapi.yaml. */
  @Input() apiBaseUrl = '';

  @ViewChild('host') host!: ElementRef<HTMLElement>;
  @ViewChildren('pageCanvas') canvases!: QueryList<ElementRef<HTMLCanvasElement>>;

  private renderer = inject(PdfRenderService);
  private snackBar = inject(MatSnackBar);
  private cdr = inject(ChangeDetectorRef);

  readonly kinds = KINDS;
  /** Client properties a field can pre-fill from. */
  readonly bindable = [
    'name', 'companyName', 'referenceNumber', 'email',
    'phone', 'address', 'city', 'postalCode',
  ];

  definition: FormDefinition | null = null;
  pages: PageInfo[] = [];
  fields: FormField[] = [];
  kind: FieldKind = 'text';
  selectedId: string | null = null;
  draft: Draft | null = null;
  saving = false;
  dirty = false;
  loadError = '';

  private saved: FormField[] = [];
  private doc: PDFDocumentProxy | null = null;
  private renderedFor: string | null = null;
  private placed = new Map<number, PlacedField[]>();

  ngOnChanges(): void {
    void this.load();
  }

  ngAfterViewInit(): void {
    this.canvases.changes.subscribe(() => this.drawPages());
    // Rendering needs both the definition and the element it is measured
    // against, and which arrives last is a race — the definition comes over
    // the network, the element after the view is built. Both entry points
    // call render(), and it no-ops until the other half is there.
    void this.render();
  }

  private async load(): Promise<void> {
    if (!this.formId) {
      this.loadError = 'No form specified.';
      return;
    }
    try {
      const res = await fetch(`${this.apiBaseUrl}/forms/${encodeURIComponent(this.formId)}`);
      if (!res.ok) throw new Error(String(res.status));
      const definition: FormDefinition = await res.json();
      definition.document = {
        ...definition.document,
        url: `${this.apiBaseUrl}${definition.document.url}`,
      };
      this.definition = definition;
      this.fields = definition.fields.map((f) => ({ ...f, rect: { ...f.rect } }));
      this.saved = this.fields.map((f) => ({ ...f, rect: { ...f.rect } }));
      this.dirty = false;

      // detectChanges, not markForCheck: the element measured for the render
      // scale lives inside *ngIf="definition", so it does not exist until the
      // view has actually been rebuilt. Scheduling a check and rendering
      // immediately measures nothing and silently draws no pages.
      this.cdr.detectChanges();
      await this.render();
    } catch (err) {
      console.error('FormD: could not load form definition', err);
      this.loadError = 'Could not load this form. Check the form id and the backend URL.';
      this.cdr.markForCheck();
    }
  }

  private async render(): Promise<void> {
    const def = this.definition;
    if (!def?.document?.url || !this.host) return;

    const key = `${def.id}@${def.document.sha256}`;
    if (this.renderedFor === key) return;
    this.renderedFor = key;

    try {
      this.doc = await this.renderer.load(def.document.url);
      // The inspector column and the card's own padding come off the width the
      // pages get, or the document renders wider than the space left for it.
      const measured = this.host.nativeElement.clientWidth;
      const available = measured ? Math.max(measured - INSPECTOR_ALLOWANCE, 320) : 900;
      const scale = this.renderer.fitScale(def.document.pages[0]?.width ?? 595, available);

      const described: PageInfo[] = [];
      for (let i = 0; i < this.doc.numPages; i++) {
        described.push(await this.renderer.describePage(this.doc, i, scale));
      }
      this.pages = described;
      this.reposition();
      this.cdr.markForCheck();
      queueMicrotask(() => this.drawPages());
    } catch (err) {
      console.error('FormD: failed to render document', err);
      this.loadError = 'Could not render the document.';
      this.cdr.markForCheck();
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
   * Recomputes screen rectangles for every field.
   *
   * Precomputed rather than derived in the template: a method that builds a
   * rect object per binding runs on every change detection pass and hands the
   * loop fresh identities each time, which is both wasteful and enough to
   * destabilise it.
   */
  private reposition(): void {
    this.placed = new Map();
    for (const page of this.pages) {
      this.placed.set(
        page.index,
        this.fields
          .filter((f) => f.rect.page === page.index)
          .map((field) => ({ field, screen: toScreenRect(field.rect, page.pdfHeight, page.scale) }))
      );
    }
  }

  placedOn(pageIndex: number): PlacedField[] {
    return this.placed.get(pageIndex) ?? EMPTY;
  }

  trackField(_i: number, placed: PlacedField): string {
    return placed.field.id;
  }

  selected(): FormField | undefined {
    return this.fields.find((f) => f.id === this.selectedId);
  }

  kindLabel(kind: FieldKind): string {
    return KINDS.find((k) => k.kind === kind)?.label ?? kind;
  }

  /* ------------------------------------------------------------- drawing */

  onPointerDown(event: PointerEvent, page: PageInfo): void {
    const surface = event.currentTarget as HTMLElement;
    const bounds = surface.getBoundingClientRect();
    const startX = event.clientX - bounds.left;
    const startY = event.clientY - bounds.top;

    // Clicking an existing box selects it rather than drawing over it.
    const hit = this.placedOn(page.index).find(
      (p) =>
        startX >= p.screen.left && startX <= p.screen.left + p.screen.width &&
        startY >= p.screen.top && startY <= p.screen.top + p.screen.height
    );
    if (hit) {
      this.selectedId = hit.field.id;
      this.cdr.markForCheck();
      return;
    }

    event.preventDefault();
    surface.setPointerCapture(event.pointerId);

    const move = (e: PointerEvent) => {
      const x = e.clientX - bounds.left;
      const y = e.clientY - bounds.top;
      this.draft = {
        page: page.index,
        left: Math.min(startX, x),
        top: Math.min(startY, y),
        width: Math.abs(x - startX),
        height: Math.abs(y - startY),
      };
      this.cdr.markForCheck();
    };

    const up = () => {
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerup', up);
      surface.removeEventListener('pointercancel', up);

      const drawn = this.draft;
      this.draft = null;

      if (!drawn || drawn.width < MIN_DRAG || drawn.height < MIN_DRAG) {
        // Too small to be a box — treat it as clicking empty page.
        this.selectedId = null;
        this.cdr.markForCheck();
        return;
      }
      this.place(drawn, page);
    };

    surface.addEventListener('pointermove', move);
    surface.addEventListener('pointerup', up);
    surface.addEventListener('pointercancel', up);
  }

  private place(drawn: Draft, page: PageInfo): void {
    const id = this.nextId(this.kind);
    const field: FormField = {
      id,
      kind: this.kind,
      label: this.kindLabel(this.kind),
      rect: toPdfRect(drawn, page.pdfHeight, page.scale, page.index),
    };
    this.fields = [...this.fields, field];
    this.selectedId = id;
    this.markChanged();
  }

  /** `signature_1`, `text_2` — readable, and unique against what is placed. */
  private nextId(kind: FieldKind): string {
    let n = this.fields.filter((f) => f.kind === kind).length + 1;
    const taken = new Set(this.fields.map((f) => f.id));
    while (taken.has(`${kind}_${n}`)) n++;
    return `${kind}_${n}`;
  }

  /* ------------------------------------------------------------- editing */

  edit(field: FormField, patch: Partial<FormField>): void {
    this.fields = this.fields.map((f) => (f === field ? { ...f, ...patch } : f));
    this.markChanged();
  }

  /** Renaming is separate because the key must stay unique to stay meaningful. */
  rename(field: FormField, id: string): void {
    const trimmed = id.trim();
    if (!trimmed || this.fields.some((f) => f !== field && f.id === trimmed)) {
      this.snackBar.open(`"${trimmed || id}" is already used, or empty.`, 'OK', { duration: 4000 });
      return;
    }
    this.fields = this.fields.map((f) => (f === field ? { ...f, id: trimmed } : f));
    this.selectedId = trimmed;
    this.markChanged();
  }

  remove(field: FormField): void {
    this.fields = this.fields.filter((f) => f !== field);
    if (this.selectedId === field.id) this.selectedId = null;
    this.markChanged();
  }

  revert(): void {
    this.fields = this.saved.map((f) => ({ ...f, rect: { ...f.rect } }));
    this.selectedId = null;
    this.dirty = false;
    this.reposition();
    this.cdr.markForCheck();
  }

  private markChanged(): void {
    this.dirty = true;
    this.reposition();
    this.cdr.markForCheck();
  }

  async save(): Promise<void> {
    if (!this.definition) return;
    this.saving = true;
    this.cdr.markForCheck();

    try {
      const res = await fetch(`${this.apiBaseUrl}/forms/${this.definition.id}/fields`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fields: this.fields }),
      });
      const body = await res.json();
      if (!res.ok) {
        // The validator names the field and what is wrong with it, which is
        // more use than anything this component could say instead.
        this.snackBar.open(body.error ?? `Could not save (${res.status})`, 'OK', { duration: 8000 });
        return;
      }

      this.definition = { ...this.definition, version: body.version, fields: body.fields };
      this.saved = this.fields.map((f) => ({ ...f, rect: { ...f.rect } }));
      this.dirty = false;
      this.snackBar.open(`Saved. This form is now version ${body.version}.`, 'OK', {
        duration: 5000,
        panelClass: 'snack-success',
      });
    } catch (err) {
      console.error('FormD: could not save fields', err);
      this.snackBar.open('Could not reach the server to save these fields.', 'OK', { duration: 6000 });
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }
}
