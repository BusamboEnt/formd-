import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Store } from './store.js';
import { extractFormDefinition } from './import/extract-pdf.js';
import { normalizeToPdf, ConversionUnavailableError } from './import/normalize.js';
import { stampPdf } from './import/stamp.js';

/** Fields without which a stored record cannot prove what was signed. */
const REQUIRED = ['client', 'agreementTitle', 'agreementVersion', 'agreementClauses', 'signatureDataUrl'];

function validateSubmission(body) {
  if (!body || typeof body !== 'object') return 'body must be a JSON object';
  const missing = REQUIRED.filter((f) => body[f] === undefined || body[f] === null);
  if (missing.length) return `missing required field(s): ${missing.join(', ')}`;
  if (!body.client?.id) return 'client.id is required';
  if (!Array.isArray(body.agreementClauses) || body.agreementClauses.length === 0) {
    // A record whose terms are absent cannot show what was agreed to, which
    // is the entire purpose of keeping it.
    return 'agreementClauses must be a non-empty array';
  }
  return null;
}

export function createApp(store = new Store()) {
  const app = express();

  // The widget is embedded in other people's pages, so it is cross-origin by
  // definition. Lock ALLOWED_ORIGINS down in production.
  //
  // '*' is handled explicitly: passing it through as a list entry makes cors
  // string-match the literal asterisk against the request origin and reject
  // every request, which reads as a server fault rather than a config choice.
  const configured = process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
  const allowAll = !configured?.length || configured.includes('*');
  app.use(cors({ origin: allowAll ? true : configured }));

  // Signature data URLs make these payloads large.
  app.use(express.json({ limit: '10mb' }));

  // Signature data URLs and scanned PDFs are both large.
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  /**
   * Digitises an uploaded PDF or .docx into a FormDefinition.
   *
   * A PDF carrying an AcroForm needs no further work — its own field
   * coordinates are extracted. Anything else imports successfully with zero
   * fields and an `origin.note` saying so, because "no fields found" is a
   * legitimate outcome to be told about, not an error to fail on.
   */
  app.post('/forms/import', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded. Send multipart field "file".' });
      }

      let normalized;
      try {
        normalized = await normalizeToPdf(req.file.buffer, req.file.originalname);
      } catch (err) {
        if (err instanceof ConversionUnavailableError) {
          // The request is valid; this deployment cannot serve it.
          return res.status(501).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message });
      }

      const definition = await extractFormDefinition(normalized.pdf, {
        filename: req.file.originalname,
      });
      if (normalized.converted) {
        definition.origin.source = 'converted';
      }
      definition.document.url = `/forms/${definition.id}/document`;

      store.saveForm(definition, normalized.pdf);
      res.status(201).json(definition);
    } catch (err) {
      next(err);
    }
  });

  app.get('/forms', (_req, res, next) => {
    try {
      res.json(store.listForms());
    } catch (err) {
      next(err);
    }
  });

  app.get('/forms/:id', (req, res, next) => {
    try {
      const form = store.getForm(req.params.id);
      if (!form) return res.status(404).json({ error: 'form not found' });
      res.json(form);
    } catch (err) {
      next(err);
    }
  });

  // The exact bytes the fields were positioned against.
  app.get('/forms/:id/document', (req, res, next) => {
    try {
      const pdf = store.getFormDocument(req.params.id);
      if (!pdf) return res.status(404).json({ error: 'form not found' });
      res.type('application/pdf').send(Buffer.from(pdf));
    } catch (err) {
      next(err);
    }
  });

  app.get('/clients', (req, res, next) => {
    try {
      res.json(store.searchClients(String(req.query.search ?? '').trim()));
    } catch (err) {
      next(err);
    }
  });

  app.get('/clients/:id', (req, res, next) => {
    try {
      const client = store.getClient(req.params.id);
      // 404 means no such client; anything else is a fault the caller must be
      // able to tell apart from an absent record.
      if (!client) return res.status(404).json({ error: 'client not found' });
      res.json(client);
    } catch (err) {
      next(err);
    }
  });

  app.post('/agreements', (req, res, next) => {
    try {
      const problem = validateSubmission(req.body);
      if (problem) return res.status(400).json({ error: problem });
      res.status(201).json(store.saveAgreement(req.body));
    } catch (err) {
      next(err);
    }
  });

  /**
   * Signs an imported form: writes the captured values onto the client's own
   * document and stores the result.
   *
   * Distinct from POST /agreements, which records a clause-based agreement and
   * has no source document to mark up.
   */
  app.post('/forms/:id/sign', async (req, res, next) => {
    try {
      const definition = store.getForm(req.params.id);
      if (!definition) return res.status(404).json({ error: 'form not found' });

      const { client, values } = req.body ?? {};
      if (!client?.id) return res.status(400).json({ error: 'client.id is required' });
      if (!values || typeof values !== 'object') {
        return res.status(400).json({ error: 'values is required' });
      }

      const sourcePdf = store.getFormDocument(req.params.id);

      let signedPdf;
      try {
        signedPdf = await stampPdf(sourcePdf, definition, values);
      } catch (err) {
        // A missing required field or a malformed signature is the caller's
        // to fix, not a server fault.
        return res.status(400).json({ error: err.message });
      }

      const submission = {
        client,
        formDate: new Date().toLocaleDateString('en-ZA'),
        formDefinitionId: definition.id,
        formVersion: definition.version,
        // Cited so a document swapped after signing is detectable.
        documentSha256: definition.document.sha256,
        values,
        savedAt: new Date().toISOString(),
      };

      const saved = store.saveAgreement(submission, signedPdf);
      res.status(201).json({ ...saved, documentUrl: `/agreements/${saved.id}/document` });
    } catch (err) {
      next(err);
    }
  });

  /** The signed document itself — the client's PDF with the marks in it. */
  app.get('/agreements/:id/document', (req, res, next) => {
    try {
      const pdf = store.getSignedDocument(req.params.id);
      if (!pdf) return res.status(404).json({ error: 'no signed document for this record' });
      res.type('application/pdf').send(Buffer.from(pdf));
    } catch (err) {
      next(err);
    }
  });

  app.get('/agreements', (req, res, next) => {
    try {
      res.json(store.listAgreements(req.query.clientId ? String(req.query.clientId) : undefined));
    } catch (err) {
      next(err);
    }
  });

  // Faults must surface as 5xx. Returning 200 with an empty body here would
  // make an outage indistinguishable from "no results".
  app.use((err, _req, res, _next) => {
    console.error('[formd]', err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
