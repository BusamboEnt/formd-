import express from 'express';
import cors from 'cors';
import { Store } from './store.js';

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

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

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
