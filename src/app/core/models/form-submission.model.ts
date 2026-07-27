import { Client } from './client.model';
import { AgreementClause } from './agreement.model';
import { FieldValues } from './form-definition.model';

/**
 * A signed record.
 *
 * Two shapes share this type. A clause-based agreement fills
 * `agreementClauses` and captures a single `signatureDataUrl`. A
 * document-backed form fills `formDefinitionId`, `formVersion` and `values`
 * instead, with any signatures living inside `values` keyed by field id.
 *
 * The clause fields stay required so existing records and the existing flow
 * keep validating unchanged; the form fields are additive.
 */
export interface FormSubmission {
  client: Client;
  formDate: string;
  agreementTitle: string;
  /** Which revision of the wording was signed. */
  agreementVersion: string;
  agreementProvider: string;
  /** The actual terms presented to and signed by the client. */
  agreementClauses: AgreementClause[];
  acknowledgement: string;
  signatureDataUrl: string;
  savedAt: string;

  /** Set when the record came from a document-backed form rather than clauses. */
  formDefinitionId?: string;
  formVersion?: string;
  /** Which exact document bytes were presented, so a later swap is detectable. */
  documentSha256?: string;
  /** Captured field values, keyed by `FormField.id`. */
  values?: FieldValues;
}
