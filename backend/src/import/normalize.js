import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, basename } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Thrown when a document could be handled in principle but this deployment cannot. */
export class ConversionUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConversionUnavailableError';
  }
}

const LIBREOFFICE_HINT =
  'Converting .docx requires LibreOffice on the server. Install it (apt-get ' +
  'install -y libreoffice-writer) or upload a PDF instead.';

/**
 * Brings an upload to PDF.
 *
 * Everything downstream positions fields at fixed page coordinates, which only
 * means anything against a fixed layout. A .docx reflows with fonts, page size
 * and the reader, so it is converted once at import and that PDF becomes the
 * document of record — re-deriving it later could move the page under fields
 * already placed on it.
 */
export async function normalizeToPdf(buffer, filename) {
  const ext = extname(filename).toLowerCase();

  if (ext === '.pdf') {
    return { pdf: buffer, converted: false };
  }

  if (ext !== '.docx') {
    throw new Error(`Unsupported file type "${ext || filename}". Upload a .pdf or .docx.`);
  }

  const dir = await mkdtemp(join(tmpdir(), 'formd-import-'));
  try {
    const input = join(dir, basename(filename));
    await writeFile(input, buffer);

    try {
      await run(
        'soffice',
        [
          '--headless',
          '-env:UserInstallation=file:///tmp/formd-lo-profile',
          '--convert-to',
          'pdf',
          '--outdir',
          dir,
          input,
        ],
        { timeout: 120_000 }
      );
    } catch (err) {
      // ENOENT means no binary; anything else means it ran and failed. Both
      // leave the caller without a PDF, and both are the operator's to fix, so
      // they surface as the same actionable error rather than a generic 500.
      throw new ConversionUnavailableError(`${LIBREOFFICE_HINT} (${err.code || err.message})`);
    }

    const produced = (await readdir(dir)).find((f) => f.toLowerCase().endsWith('.pdf'));
    if (!produced) {
      // LibreOffice exits 0 even when it silently refuses a file, so the
      // absence of output is the only reliable signal that it did not work.
      throw new ConversionUnavailableError(
        `${LIBREOFFICE_HINT} (conversion reported success but produced no PDF)`
      );
    }

    return { pdf: await readFile(join(dir, produced)), converted: true };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
