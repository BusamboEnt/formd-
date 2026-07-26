import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * SQLite-backed storage.
 *
 * SQLite keeps this reference deployable with no external service — on Railway
 * you attach a volume and point DATABASE_PATH at it. Everything the rest of
 * the service needs is behind this class, so swapping in Postgres means
 * reimplementing these five methods and nothing else.
 */
export class Store {
  constructor(path = process.env.DATABASE_PATH || './data/formd.db') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.#migrate();
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clients (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        address         TEXT NOT NULL DEFAULT '',
        city            TEXT NOT NULL DEFAULT '',
        postalCode      TEXT NOT NULL DEFAULT '',
        email           TEXT NOT NULL DEFAULT '',
        phone           TEXT NOT NULL DEFAULT '',
        referenceNumber TEXT NOT NULL DEFAULT '',
        companyName     TEXT
      );

      CREATE TABLE IF NOT EXISTS agreements (
        id       TEXT PRIMARY KEY,
        clientId TEXT NOT NULL,
        savedAt  TEXT NOT NULL,
        -- The full submission, including the agreement text that was signed.
        -- Stored verbatim: a record has to prove what was actually agreed to.
        payload  TEXT NOT NULL,
        -- The client's own document with the marks written into it, for
        -- form-backed records. Null for clause-based ones, which have no
        -- source document.
        signedPdf BLOB
      );

      CREATE INDEX IF NOT EXISTS idx_agreements_client ON agreements(clientId);

      CREATE TABLE IF NOT EXISTS forms (
        id         TEXT PRIMARY KEY,
        importedAt TEXT NOT NULL,
        -- The FormDefinition, including field positions.
        definition TEXT NOT NULL,
        -- The pinned PDF the fields are positioned against. Stored rather than
        -- referenced because the coordinates are meaningless without these
        -- exact bytes, and a file swapped underneath them would move fields
        -- silently.
        pdf        BLOB NOT NULL
      );
    `);

    this.#addColumnIfMissing('agreements', 'signedPdf', 'BLOB');
  }

  /**
   * CREATE TABLE IF NOT EXISTS is a no-op on a database that already exists, so
   * a column added to the statement above never reaches a deployment with data
   * in it. Existing installs need the ALTER.
   */
  #addColumnIfMissing(table, column, type) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }

  searchClients(term) {
    if (!term) return this.db.prepare('SELECT * FROM clients ORDER BY name').all();
    const like = `%${term.toLowerCase()}%`;
    return this.db
      .prepare(
        `SELECT * FROM clients
         WHERE lower(name) LIKE ?
            OR lower(referenceNumber) LIKE ?
            OR lower(coalesce(companyName, '')) LIKE ?
         ORDER BY name`
      )
      .all(like, like, like);
  }

  getClient(id) {
    return this.db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  }

  upsertClient(c) {
    this.db
      .prepare(
        `INSERT INTO clients
           (id, name, address, city, postalCode, email, phone, referenceNumber, companyName)
         VALUES (@id, @name, @address, @city, @postalCode, @email, @phone, @referenceNumber, @companyName)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, address=excluded.address, city=excluded.city,
           postalCode=excluded.postalCode, email=excluded.email, phone=excluded.phone,
           referenceNumber=excluded.referenceNumber, companyName=excluded.companyName`
      )
      .run({ companyName: null, address: '', city: '', postalCode: '', email: '', phone: '', referenceNumber: '', ...c });
    return this.getClient(c.id);
  }

  saveAgreement(submission, signedPdf = null) {
    const id = randomUUID();
    const savedAt = submission.savedAt || new Date().toISOString();
    this.db
      .prepare('INSERT INTO agreements (id, clientId, savedAt, payload, signedPdf) VALUES (?, ?, ?, ?, ?)')
      .run(id, submission.client.id, savedAt, JSON.stringify(submission), signedPdf);
    return { id, savedAt };
  }

  getSignedDocument(id) {
    const row = this.db.prepare('SELECT signedPdf FROM agreements WHERE id = ?').get(id);
    return row?.signedPdf ?? undefined;
  }

  listAgreements(clientId) {
    const rows = clientId
      ? this.db.prepare('SELECT * FROM agreements WHERE clientId = ? ORDER BY savedAt DESC').all(clientId)
      : this.db.prepare('SELECT * FROM agreements ORDER BY savedAt DESC').all();
    return rows.map((r) => ({ id: r.id, ...JSON.parse(r.payload) }));
  }

  saveForm(definition, pdfBuffer) {
    this.db
      .prepare('INSERT INTO forms (id, importedAt, definition, pdf) VALUES (?, ?, ?, ?)')
      .run(definition.id, new Date().toISOString(), JSON.stringify(definition), pdfBuffer);
    return definition;
  }

  getForm(id) {
    const row = this.db.prepare('SELECT definition FROM forms WHERE id = ?').get(id);
    return row ? JSON.parse(row.definition) : undefined;
  }

  getFormDocument(id) {
    const row = this.db.prepare('SELECT pdf FROM forms WHERE id = ?').get(id);
    return row ? row.pdf : undefined;
  }

  listForms() {
    return this.db
      .prepare('SELECT definition FROM forms ORDER BY importedAt DESC')
      .all()
      .map((r) => JSON.parse(r.definition));
  }

  close() {
    this.db.close();
  }
}
