import { Injectable } from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';

type PdfJs = typeof import('pdfjs-dist');

/**
 * Page metadata, resolved before anything is drawn.
 *
 * Deliberately carries no canvas. The canvases belong to the template so
 * Angular owns their lifecycle — appending them by hand races change
 * detection, and the placeholders they were meant to land in do not exist yet
 * at the moment the pages resolve.
 */
export interface PageInfo {
  /** 0-based, matching FieldRect.page. */
  index: number;
  /** CSS pixels the page occupies at the scale it will be rendered. */
  cssWidth: number;
  cssHeight: number;
  /** PDF user-space size, needed to place fields. */
  pdfWidth: number;
  pdfHeight: number;
  /** cssWidth / pdfWidth. */
  scale: number;
}

@Injectable({ providedIn: 'root' })
export class PdfRenderService {
  private pdfjs: Promise<PdfJs> | null = null;

  /**
   * Loads pdf.js on demand.
   *
   * It is roughly 400 kB and is only needed by the document-backed form flow,
   * which most sessions never enter — a static import put all of it in the
   * initial bundle and broke the size budget outright.
   *
   * The worker is served from our own assets rather than a CDN, for the same
   * reason the fonts are: this runs on machines that may be offline or behind
   * a firewall, and a missing worker means nothing renders at all.
   * angular.json copies it out of pdfjs-dist at build time.
   *
   * The path is overridable because `assets/…` is only correct for a host
   * serving this from its root. Anything else — a widget mounted under a
   * sub-path, or a single-file build with the worker inlined as a blob — needs
   * to say where the worker actually is:
   *
   *   window.FormD = { ...window.FormD, pdfWorkerSrc: '/static/pdf.worker.min.mjs' };
   *
   * Read off the global rather than injected so a plain-HTML host can set it
   * without touching Angular DI, matching how the rest of FormD's element
   * configuration works.
   */
  private lib(): Promise<PdfJs> {
    this.pdfjs ??= import('pdfjs-dist').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = this.workerSrc();
      return mod;
    });
    return this.pdfjs;
  }

  private workerSrc(): string {
    const configured = (globalThis as { FormD?: { pdfWorkerSrc?: string } }).FormD?.pdfWorkerSrc;
    return configured || 'assets/pdf.worker.min.mjs';
  }

  async load(url: string): Promise<PDFDocumentProxy> {
    const pdfjs = await this.lib();
    return pdfjs.getDocument({ url }).promise;
  }

  /** Measures a page without drawing it, so the template can size its canvas. */
  async describePage(doc: PDFDocumentProxy, index: number, scale: number): Promise<PageInfo> {
    const page = await doc.getPage(index + 1); // pdfjs pages are 1-based
    const viewport = page.getViewport({ scale });
    const unscaled = page.getViewport({ scale: 1 });
    return {
      index,
      cssWidth: viewport.width,
      cssHeight: viewport.height,
      pdfWidth: unscaled.width,
      pdfHeight: unscaled.height,
      scale,
    };
  }

  /**
   * Draws a page into a canvas the caller already owns.
   *
   * The backing store is multiplied by the device pixel ratio on top of the
   * CSS scale, so a document on a retina screen is not rasterised at half
   * resolution and left looking soft.
   */
  async renderPageInto(
    doc: PDFDocumentProxy,
    info: PageInfo,
    canvas: HTMLCanvasElement
  ): Promise<void> {
    const page = await doc.getPage(info.index + 1);
    const viewport = page.getViewport({ scale: info.scale });
    const dpr = Math.max(window.devicePixelRatio || 1, 1);

    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const context = canvas.getContext('2d')!;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    await page.render({ canvasContext: context, viewport }).promise;
  }

  /** Scale that fits a page to the available width, never enlarging past 1:1. */
  fitScale(pdfWidth: number, availableWidth: number): number {
    if (!availableWidth || !pdfWidth) return 1;
    return Math.min(availableWidth / pdfWidth, 1.5);
  }
}
