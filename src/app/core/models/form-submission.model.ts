import { Client } from './client.model';
import { AgreementClause } from './agreement.model';

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
}
