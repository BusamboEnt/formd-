import { Client } from './client.model';

export interface FormSubmission {
  client: Client;
  formDate: string;
  agreementTitle: string;
  agreementBody: string;
  signatureDataUrl: string;
  savedAt: string;
}
