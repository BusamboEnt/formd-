import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import SignaturePad from 'signature_pad';
import { FORMD_COPY } from '../../../core/config/formd.copy';

@Component({
  selector: 'app-signature-pad',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <div class="sig-wrapper">
      <canvas #sigCanvas class="sig-canvas"></canvas>
      <div class="sig-actions">
        <p class="sig-hint"><mat-icon>edit</mat-icon> {{ copy.signature.hint }}</p>
        <button mat-stroked-button color="warn" type="button" (click)="clear()">
          {{ copy.signature.clear }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .sig-wrapper {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
    }
    .sig-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .sig-canvas {
      border: 1px dashed var(--border);
      border-radius: var(--radius);
      cursor: crosshair;
      touch-action: none;
      background: var(--background);
      width: 100%;
      min-height: 200px;
      display: block;
    }
    .sig-canvas.signing {
      border: 1px solid var(--ring);
      background: var(--muted);
    }
    .sig-hint {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--muted-foreground);
      font-size: 13px;
      margin: 4px 0 0;
    }
  `],
})
export class SignaturePadComponent implements OnInit, OnDestroy {
  @ViewChild('sigCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @Output() signatureChange = new EventEmitter<string | null>();

  readonly copy = inject(FORMD_COPY);

  private pad!: SignaturePad;
  private firstStroke = true;

  private observer?: ResizeObserver;

  ngOnInit(): void {
    this.initPad();

    /**
     * The backing store has to track the element's real size.
     *
     * resizeCanvas() alone runs once, before a container has necessarily
     * settled — inside a dialog it measures the canvas mid-open, so the
     * buffer ends up sized for 512 CSS px while the element renders at 894.
     * Strokes then land at the wrong coordinates and the captured signature
     * is squashed into a corner. window:resize never fires for any of that,
     * because the window never changed.
     */
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.syncCanvasSize());
      this.observer.observe(this.canvasRef.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.pad?.off();
  }

  private initPad(): void {
    const canvas = this.canvasRef.nativeElement;
    this.resizeCanvas(canvas);
    this.drawWatermark(canvas);
    this.pad = new SignaturePad(canvas, {
      minWidth: 1,
      maxWidth: 3,
      penColor: '#000000',
    });
    this.pad.addEventListener('beginStroke', () => {
      if (this.firstStroke) {
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.firstStroke = false;
      }
      canvas.classList.add('signing');
    });
    this.pad.addEventListener('endStroke', () => {
      canvas.classList.remove('signing');
      this.signatureChange.emit(this.pad.isEmpty() ? null : this.pad.toDataURL('image/png'));
    });
  }

  @HostListener('window:resize')
  onResize(): void {
    this.syncCanvasSize();
  }

  /**
   * Re-sizes the buffer to match the element, preserving anything drawn.
   *
   * Skipped when the size already matches, because assigning canvas.width
   * clears the canvas — resizing on every observer callback would wipe a
   * signature mid-stroke.
   */
  private syncCanvasSize(): void {
    const canvas = this.canvasRef.nativeElement;
    if (!this.pad || !canvas.offsetWidth) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const wanted = { w: canvas.offsetWidth * ratio, h: canvas.offsetHeight * ratio };
    if (canvas.width === wanted.w && canvas.height === wanted.h) return;

    const data = this.pad.toData();
    this.resizeCanvas(canvas);
    if (data.length) {
      this.pad.fromData(data);
    } else {
      // Nothing drawn yet, so the watermark the resize just cleared is still
      // the right thing to be showing.
      this.firstStroke = true;
      this.drawWatermark(canvas);
    }
  }

  private resizeCanvas(canvas: HTMLCanvasElement): void {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);

    // Measured before anything is assigned. A canvas takes its intrinsic size
    // from its width/height attributes, and the element is only constrained by
    // min-height, so writing the attribute makes the element taller — which
    // the ResizeObserver sees, and grows it again. Pinning the CSS size to
    // what was measured breaks that feedback loop.
    const cssWidth = canvas.offsetWidth;
    const cssHeight = canvas.offsetHeight;

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = cssWidth * ratio;
    canvas.height = cssHeight * ratio;

    // setTransform, not scale: scale() multiplies the transform already in
    // place, so resizing twice leaves the context at ratio², and pointer
    // coordinates land off the canvas entirely. setTransform replaces it.
    canvas.getContext('2d')!.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  private drawWatermark(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d')!;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    ctx.save();
    // The context is already scaled by `ratio`, so everything here is in CSS
    // pixels — multiplying by the ratio again would place the text off-centre
    // on any HiDPI screen.
    ctx.font = '16px Inter, sans-serif';
    ctx.fillStyle = 'rgba(113,113,122,0.35)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      this.copy.signature.watermark,
      canvas.width / ratio / 2,
      canvas.height / ratio / 2
    );
    ctx.restore();
  }

  clear(): void {
    this.pad.clear();
    this.firstStroke = true;
    this.drawWatermark(this.canvasRef.nativeElement);
    this.signatureChange.emit(null);
  }

  isEmpty(): boolean {
    return this.pad?.isEmpty() ?? true;
  }

  getDataUrl(): string | null {
    return this.pad?.isEmpty() ? null : this.pad.toDataURL('image/png');
  }
}
