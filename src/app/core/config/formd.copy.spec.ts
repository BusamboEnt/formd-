import { DEFAULT_COPY, mergeCopy, fill } from './formd.copy';

describe('mergeCopy', () => {
  it('returns the defaults when nothing is overridden', () => {
    expect(mergeCopy()).toBe(DEFAULT_COPY);
  });

  // The reason the merge exists: a consumer wanting one different button label
  // should not have to restate every other string in that group.
  it('keeps sibling strings when one is overridden', () => {
    const copy = mergeCopy({ nav: { next: 'Continue' } });

    expect(copy.nav.next).toBe('Continue');
    expect(copy.nav.back).toBe(DEFAULT_COPY.nav.back);
    expect(copy.nav.newAgreement).toBe(DEFAULT_COPY.nav.newAgreement);
  });

  it('keeps untouched groups intact', () => {
    const copy = mergeCopy({ nav: { next: 'Continue' } });

    expect(copy.signature).toEqual(DEFAULT_COPY.signature);
    expect(copy.confirmation).toEqual(DEFAULT_COPY.confirmation);
  });

  it('merges several groups at once', () => {
    const copy = mergeCopy({
      steps: { sign: 'Signature' },
      confirmation: { saveAction: 'Submit' },
    });

    expect(copy.steps.sign).toBe('Signature');
    expect(copy.steps.findClient).toBe(DEFAULT_COPY.steps.findClient);
    expect(copy.confirmation.saveAction).toBe('Submit');
    expect(copy.confirmation.success).toBe(DEFAULT_COPY.confirmation.success);
  });

  it('does not mutate the defaults', () => {
    const before = DEFAULT_COPY.nav.next;
    mergeCopy({ nav: { next: 'Mutated?' } });
    expect(DEFAULT_COPY.nav.next).toBe(before);
  });

  it('allows an empty string as a deliberate override', () => {
    expect(mergeCopy({ clientSearch: { subtitle: '' } }).clientSearch.subtitle).toBe('');
  });
});

describe('fill', () => {
  it('substitutes a placeholder', () => {
    expect(fill('Hand the device to {client}.', { client: 'Ada' }))
      .toBe('Hand the device to Ada.');
  });

  it('substitutes several placeholders', () => {
    expect(fill('as of {date} between {provider} and:', { date: '1 May', provider: 'Acme' }))
      .toBe('as of 1 May between Acme and:');
  });

  it('leaves unknown placeholders untouched rather than blanking them', () => {
    expect(fill('Hello {nobody}', { client: 'Ada' })).toBe('Hello {nobody}');
  });

  it('returns text without placeholders unchanged', () => {
    expect(fill('No placeholders here', { client: 'Ada' })).toBe('No placeholders here');
  });
});
