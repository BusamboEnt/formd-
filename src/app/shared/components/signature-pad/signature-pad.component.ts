import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import SignaturePad from 'signature_pad';

@Component({
  selector: 'app-signature-pad',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <div class="sig-wrapper">
      <canvas #sigCanvas class="sig-canvas"></canvas>
      <div class="sig-actions">
        <p class="sig-hint"><mat-icon>edit</mat-icon> Draw your signature above</p>
        <button mat-stroked-button color="warn" type="button" (click)="clear()">
          Clear Signature
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

  private pad!: SignaturePad;
  private firstStroke = true;

  ngOnInit(): void {
    this.initPad();
  }

  ngOnDestroy(): void {
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
    const canvas = this.canvasRef.nativeElement;
    const data = this.pad.toData();
    this.resizeCanvas(canvas);
    this.pad.fromData(data);
  }

  private resizeCanvas(canvas: HTMLCanvasElement): void {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d')!.scale(ratio, ratio);
  }

  private drawWatermark(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d')!;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    ctx.save();
    ctx.font = `${16 * ratio}px Inter, sans-serif`;
    ctx.fillStyle = 'rgba(113,113,122,0.35)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Sign here', (canvas.width / ratio) / 2 * ratio, (canvas.height / ratio) / 2 * ratio);
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
