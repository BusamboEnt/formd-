import { InjectionToken } from '@angular/core';

/** Marks every property optional, recursively, for partial overrides. */
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export interface FormdBranding {
  /** Brand mark shown in the toolbar and on the document. */
  name: string;
  /** Sits beside the brand mark in the toolbar. Empty hides it. */
  tagline: string;
  /** Whether the brand mark appears on the agreement document itself. */
  showInDocument: boolean;
}

/**
 * Every user-facing string, grouped by where it appears.
 *
 * Split out from FormdConfig because the shape is large and consumers
 * usually want to override a handful of strings, not restate all of them —
 * `provideFormd()` merges a partial over these defaults.
 */
export interface FormdCopy {
  steps: {
    findClient: string;
    reviewForm: string;
    sign: string;
    save: string;
  };
  nav: {
    next: string;
    back: string;
    proceedToSign: string;
    reviewAndSave: string;
    newAgreement: string;
  };
  clientSearch: {
    title: string;
    subtitle: string;
    fieldLabel: string;
    placeholder: string;
    noMatches: string;
    unreachable: string;
  };
  formPreview: {
    title: string;
    subtitle: string;
    partiesHeading: string;
    /** Supports {date} and {provider} placeholders. */
    preamble: string;
    referenceLabel: string;
    dateLabel: string;
    noClient: string;
  };
  signature: {
    title: string;
    /** Supports a {client} placeholder. */
    subtitle: string;
    instruction: string;
    hint: string;
    clear: string;
    captured: string;
    required: string;
    /** Drawn onto the empty canvas. */
    watermark: string;
  };
  confirmation: {
    title: string;
    subtitle: string;
    saveAction: string;
    savingAction: string;
    success: string;
    cancelled: string;
    error: string;
    missingData: string;
    signatureLabel: string;
    signedOnLabel: string;
  };
}

export const DEFAULT_BRANDING: FormdBranding = {
  name: 'FormD',
  tagline: 'Digital Signing System',
  showInDocument: true,
};

export const DEFAULT_COPY: FormdCopy = {
  steps: {
    findClient: 'Find Client',
    reviewForm: 'Review Form',
    sign: 'Sign',
    save: 'Save',
  },
  nav: {
    next: 'Next',
    back: 'Back',
    proceedToSign: 'Proceed to Sign',
    reviewAndSave: 'Review & Save',
    newAgreement: 'New Agreement',
  },
  clientSearch: {
    title: 'Find Client',
    subtitle: 'Search by client name or reference number.',
    fieldLabel: 'Search client',
    placeholder: 'e.g. John Doe or REF-2024-001',
    noMatches: 'No clients matched your search',
    unreachable: 'Could not reach the client service. Check the connection and try again.',
  },
  formPreview: {
    title: 'Review Agreement',
    subtitle: 'Please review the agreement below before signing.',
    partiesHeading: 'Parties',
    preamble:
      'This Agreement is entered into as of {date} between {provider} ("Service Provider") and:',
    referenceLabel: 'Reference:',
    dateLabel: 'Date:',
    noClient: 'No client selected. Please go back and select a client.',
  },
  signature: {
    title: 'Client Signature',
    subtitle: 'Please hand the device to {client} to sign below.',
    instruction: 'Draw your signature in the box below using your finger or stylus.',
    hint: 'Draw your signature above',
    clear: 'Clear Signature',
    captured: 'Signature captured',
    required: 'Signature required to proceed',
    watermark: 'Sign here',
  },
  confirmation: {
    title: 'Review & Save',
    subtitle: 'Confirm the details below, then save the signed agreement.',
    saveAction: 'Save PNG & JSON',
    savingAction: 'Saving…',
    success: 'Agreement saved successfully!',
    cancelled: 'Save cancelled — nothing was written.',
    error: 'Save failed. Please try again or check browser permissions.',
    missingData: 'Missing client details or signature. Please go back and complete the previous steps.',
    signatureLabel: 'Signature',
    signedOnLabel: 'Signed:',
  },
};

export const FORMD_BRANDING = new InjectionToken<FormdBranding>('FORMD_BRANDING');
export const FORMD_COPY = new InjectionToken<FormdCopy>('FORMD_COPY');

/**
 * Merges an override over defaults, one level into each group, so a consumer
 * can replace a single string without restating its siblings.
 */
export function mergeCopy(overrides?: DeepPartial<FormdCopy>): FormdCopy {
  if (!overrides) return DEFAULT_COPY;
  const merged = {} as FormdCopy;
  for (const group of Object.keys(DEFAULT_COPY) as (keyof FormdCopy)[]) {
    merged[group] = { ...DEFAULT_COPY[group], ...(overrides[group] ?? {}) } as any;
  }
  return merged;
}

/** Substitutes {name} placeholders. Unknown keys are left untouched. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}
