import { Injectable } from '@angular/core';
import html2canvas from 'html2canvas';
import { FormSubmission } from '../models/form-submission.model';

@Injectable({ providedIn: 'root' })
export class FormSaveService {
  async savePng(formElement: HTMLElement, filename: string): Promise<void> {
    const canvas = await html2canvas(formElement, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    });

    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png')
    );

    await this.saveBlob(blob, `${filename}.png`, 'image/png');
  }

  async saveJson(submission: FormSubmission, filename: string): Promise<void> {
    const json = JSON.stringify(submission, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    await this.saveBlob(blob, `${filename}.json`, 'application/json');
  }

  async saveAll(formElement: HTMLElement, submission: FormSubmission): Promise<void> {
    const safeName = submission.client.name.replace(/\s+/g, '_');
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const filename = `${safeName}_${timestamp}`;

    await this.savePng(formElement, filename);
    await this.saveJson(submission, filename);
  }

  private async saveBlob(blob: Blob, filename: string, mimeType: string): Promise<void> {
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
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        // fall through to anchor download on other errors
      }
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
