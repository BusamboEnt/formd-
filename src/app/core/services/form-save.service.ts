import { Injectable } from '@angular/core';
import { FormSubmission } from '../models/form-submission.model';

/** Whether bytes actually reached disk. 'cancelled' means the user dismissed
 *  the save dialog and nothing was written — it must never be reported as
 *  success, or a client walks away believing a contract was filed. */
export type SaveOutcome = 'saved' | 'cancelled';

/** html2canvas waits on external resources with no internal timeout, so a
 *  single unreachable asset leaves the Save button spinning forever with no
 *  way out. Fail loudly instead. */
const RASTERIZE_TIMEOUT_MS = 20_000;

@Injectable({ providedIn: 'root' })
export class FormSaveService {
  /** html2canvas is ~200KB and is only needed when someone actually saves, so
   *  it is pulled in on demand rather than shipped in the initial bundle. */
  private async loadHtml2Canvas() {
    const mod: any = await import('html2canvas');
    return (mod.default ?? mod) as typeof import('html2canvas').default;
  }

  async savePng(formElement: HTMLElement, filename: string): Promise<SaveOutcome> {
    const html2canvas = await this.loadHtml2Canvas();

    const canvas = await this.withTimeout(
      html2canvas(formElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      }),
      RASTERIZE_TIMEOUT_MS,
      'Rendering the agreement image timed out.'
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    );

    if (!blob) {
      throw new Error('Could not rasterize the agreement to PNG.');
    }

    return this.saveBlob(blob, `${filename}.png`, 'image/png');
  }

  async saveJson(submission: FormSubmission, filename: string): Promise<SaveOutcome> {
    const json = JSON.stringify(submission, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    return this.saveBlob(blob, `${filename}.json`, 'application/json');
  }

  async saveAll(formElement: HTMLElement, submission: FormSubmission): Promise<SaveOutcome> {
    const safeName = submission.client.name.replace(/\s+/g, '_');
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const filename = `${safeName}_${timestamp}`;

    // Bail on cancellation rather than prompting again for the second file.
    if ((await this.savePng(formElement, filename)) === 'cancelled') {
      return 'cancelled';
    }
    return this.saveJson(submission, filename);
  }

  private async withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const guard = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    });
    try {
      return await Promise.race([work, guard]);
    } finally {
      clearTimeout(timer!);
    }
  }

  private async saveBlob(blob: Blob, filename: string, mimeType: string): Promise<SaveOutcome> {
    if ('showSaveFilePicker' in window) {
      try {
        const ext = filename.split('.').pop()!;
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: mimeType === 'image/png' ? 'PNG Image' : 'JSON File',
              accept: { [mimeType]: [`.${ext}`] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return 'saved';
      } catch (err: any) {
        // A real dismissal is the user's decision — report it as such rather
        // than quietly writing nothing and claiming the save worked.
        if (err?.name === 'AbortError') return 'cancelled';
        // Picker unavailable or blocked (permissions policy, embedded
        // context) — fall through to the anchor download.
      }
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';

    // The anchor must be in the document for the click to reliably start a
    // download, and the object URL must outlive the browser's read of the
    // blob. Revoking synchronously aborts downloads that have not started
    // yet — small blobs (the JSON) win that race, large ones (the PNG) lose.
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return 'saved';
  }
}
