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
import SignaturePad from 'signature_pad';

@Component({
  selector: 'app-signature-pad',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  template: `
    <div class="sig-wrapper">
      <canvas #sigCanvas class="sig-canvas"></canvas>
      <div class="sig-actions">
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
      align-items: center;
      gap: 12px;
    }
    .sig-canvas {
      border: 2px dashed #aaa;
      border-radius: 8px;
      cursor: crosshair;
      touch-action: none;
      background: #fff;
      width: 100%;
      max-width: 600px;
    }
  `],
})
export class SignaturePadComponent implements OnInit, OnDestroy {
  @ViewChild('sigCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @Output() signatureChange = new EventEmitter<string | null>();

  private pad!: SignaturePad;

  ngOnInit(): void {
    this.initPad();
  }

  ngOnDestroy(): void {
    this.pad?.off();
  }

  private initPad(): void {
    const canvas = this.canvasRef.nativeElement;
    this.resizeCanvas(canvas);
    this.pad = new SignaturePad(canvas, {
      minWidth: 1,
      maxWidth: 3,
      penColor: '#000000',
    });
    this.pad.addEventListener('endStroke', () => {
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

  clear(): void {
    this.pad.clear();
    this.signatureChange.emit(null);
  }

  isEmpty(): boolean {
    return this.pad?.isEmpty() ?? true;
  }

  getDataUrl(): string | null {
    return this.pad?.isEmpty() ? null : this.pad.toDataURL('image/png');
  }
}
