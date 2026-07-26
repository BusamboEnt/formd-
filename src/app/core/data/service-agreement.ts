import { AgreementTemplate } from '../models/agreement.model';

/**
 * Single source of truth for the service agreement.
 *
 * Both the review step (form-preview) and the saved record (confirmation)
 * read from here, so what a client sees is necessarily what gets recorded.
 * Editing any wording below requires bumping `version`.
 */
export const SERVICE_AGREEMENT: AgreementTemplate = {
  title: 'SERVICE AGREEMENT',
  version: '1.0.0',
  provider: 'FormD Services (Pty) Ltd',
  clauses: [
    {
      heading: '1. Services',
      body:
        'The Service Provider agrees to deliver the services as described in the attached ' +
        'schedule of services, in accordance with the terms and conditions set forth in ' +
        'this Agreement.',
    },
    {
      heading: '2. Payment Terms',
      body:
        'Client agrees to pay the Service Provider the agreed fees within 30 (thirty) ' +
        'days of invoice. Late payments will incur a penalty of 2% per month on the ' +
        'outstanding balance.',
    },
    {
      heading: '3. Term & Termination',
      body:
        'This Agreement commences on the date of signing and remains in effect for ' +
        "12 (twelve) months, unless terminated earlier by either party with 30 days' " +
        'written notice.',
    },
    {
      heading: '4. Confidentiality',
      body:
        'Both parties agree to keep all confidential information disclosed during the ' +
        'term of this Agreement strictly confidential and not to disclose it to any ' +
        'third party without prior written consent.',
    },
    {
      heading: '5. Governing Law',
      body:
        'This Agreement shall be governed by and construed in accordance with the laws ' +
        'of the Republic of South Africa.',
    },
  ],
  acknowledgement:
    'I, the undersigned, confirm that I have read, understood, and agree to the terms ' +
    'and conditions of this Service Agreement as set forth by FormD Services (Pty) Ltd.',
};
