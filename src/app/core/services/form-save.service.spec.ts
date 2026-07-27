import { TestBed } from '@angular/core/testing';
import { FormSaveService } from './form-save.service';
import { FormSubmission } from '../models/form-submission.model';
import { SERVICE_AGREEMENT } from '../data/service-agreement';
import { Client } from '../models/client.model';

const CLIENT: Client = {
  id: '1',
  name: 'John Doe',
  address: '12 Main Street',
  city: 'Johannesburg',
  postalCode: '2000',
  email: 'john.doe@example.com',
  phone: '+27 11 000 0001',
  referenceNumber: 'REF-2024-001',
};

const SUBMISSION: FormSubmission = {
  client: CLIENT,
  formDate: '26 July 2026',
  agreementTitle: SERVICE_AGREEMENT.title,
  agreementVersion: SERVICE_AGREEMENT.version,
  agreementProvider: SERVICE_AGREEMENT.provider,
  agreementClauses: SERVICE_AGREEMENT.clauses,
  acknowledgement: SERVICE_AGREEMENT.acknowledgement,
  signatureDataUrl: 'data:image/png;base64,AAAA',
  savedAt: '2026-07-26T00:00:00.000Z',
};

/**
 * Replace or remove window.showSaveFilePicker for the duration of a test.
 *
 * Browsers differ on whether this lives as an own property of `window` or on
 * `Window.prototype`, and an own property shadows anything set on the
 * prototype. Both are cleared before installing a stub so the result does not
 * depend on which browser is running the suite, or on test order.
 */
function setPicker(impl: unknown | undefined): void {
  delete (window as any).showSaveFilePicker;
  delete (Window.prototype as any).showSaveFilePicker;
  if (impl !== undefined) {
    Object.defineProperty(window, 'showSaveFilePicker', {
      value: impl,
      configurable: true,
      writable: true,
    });
  }
}

describe('FormSaveService', () => {
  let service: FormSaveService;
  let ownDescriptor: PropertyDescriptor | undefined;
  let protoDescriptor: PropertyDescriptor | undefined;
  let clickedAnchors: HTMLAnchorElement[];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FormSaveService);

    // Snapshot both locations so the environment is restored exactly, whatever
    // shape it started in.
    ownDescriptor = Object.getOwnPropertyDescriptor(window, 'showSaveFilePicker');
    protoDescriptor = Object.getOwnPropertyDescriptor(Window.prototype, 'showSaveFilePicker');

    // Intercept anchor clicks so the fallback path does not actually download.
    clickedAnchors = [];
    spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) {
      clickedAnchors.push(this);
    });
  });

  afterEach(() => {
    delete (window as any).showSaveFilePicker;
    delete (Window.prototype as any).showSaveFilePicker;
    if (ownDescriptor) {
      Object.defineProperty(window, 'showSaveFilePicker', ownDescriptor);
    }
    if (protoDescriptor) {
      Object.defineProperty(Window.prototype, 'showSaveFilePicker', protoDescriptor);
    }
  });

  describe('when the user dismisses the save dialog', () => {
    beforeEach(() => {
      setPicker(() =>
        Promise.reject(Object.assign(new Error('dismissed'), { name: 'AbortError' }))
      );
    });

    // This is the defect that shipped: cancelling reported success while
    // writing nothing, so a client could leave believing a contract was filed.
    it('reports cancelled rather than saved', async () => {
      await expectAsync(service.saveJson(SUBMISSION, 'record')).toBeResolvedTo('cancelled');
    });

    it('does not fall back to a download', async () => {
      await service.saveJson(SUBMISSION, 'record');
      expect(clickedAnchors.length).toBe(0);
    });

    it('does not write the JSON when the PNG was cancelled', async () => {
      spyOn(service, 'savePng').and.resolveTo('cancelled');
      const saveJson = spyOn(service, 'saveJson').and.resolveTo('saved');

      const outcome = await service.saveAll(document.createElement('div'), SUBMISSION);

      expect(outcome).toBe('cancelled');
      expect(saveJson).not.toHaveBeenCalled();
    });
  });

  describe('when the File System Access API is unavailable', () => {
    beforeEach(() => setPicker(undefined));

    it('falls back to a download and reports saved', async () => {
      await expectAsync(service.saveJson(SUBMISSION, 'record')).toBeResolvedTo('saved');
      expect(clickedAnchors.length).toBe(1);
    });

    it('names the file with the expected extension', async () => {
      await service.saveJson(SUBMISSION, 'record');
      expect(clickedAnchors[0].download).toBe('record.json');
    });

    it('detaches the anchor after clicking it', async () => {
      await service.saveJson(SUBMISSION, 'record');
      expect(clickedAnchors[0].isConnected).toBeFalse();
    });
  });

  describe('when the picker fails for a non-dismissal reason', () => {
    // e.g. blocked by permissions policy or an embedded context — the user did
    // not decline, so falling back is right.
    beforeEach(() => {
      setPicker(() =>
        Promise.reject(Object.assign(new Error('blocked'), { name: 'SecurityError' }))
      );
    });

    it('falls back to a download and reports saved', async () => {
      await expectAsync(service.saveJson(SUBMISSION, 'record')).toBeResolvedTo('saved');
      expect(clickedAnchors.length).toBe(1);
    });
  });

  describe('when the picker succeeds', () => {
    it('writes through the file handle and reports saved', async () => {
      const write = jasmine.createSpy('write');
      const close = jasmine.createSpy('close');
      setPicker(() => Promise.resolve({ createWritable: () => Promise.resolve({ write, close }) }));

      await expectAsync(service.saveJson(SUBMISSION, 'record')).toBeResolvedTo('saved');
      expect(write).toHaveBeenCalled();
      expect(close).toHaveBeenCalled();
      expect(clickedAnchors.length).toBe(0);
    });

    it('serializes the full agreement, not a placeholder', async () => {
      let written: Blob | undefined;
      setPicker(() =>
        Promise.resolve({
          createWritable: () =>
            Promise.resolve({
              write: (b: Blob) => { written = b; },
              close: () => {},
            }),
        })
      );

      await service.saveJson(SUBMISSION, 'record');
      const parsed = JSON.parse(await written!.text());

      expect(parsed.agreementClauses.length).toBe(SERVICE_AGREEMENT.clauses.length);
      expect(parsed.agreementClauses[1].heading).toBe('2. Payment Terms');
      expect(parsed.agreementClauses[1].body).toContain('30 (thirty) days of invoice');
      expect(parsed.agreementVersion).toBe(SERVICE_AGREEMENT.version);
    });
  });

  describe('rasterization timeout', () => {
    // Guards the hang: html2canvas has no internal timeout, so an unresolved
    // resource used to leave the Save button spinning forever.
    it('rejects instead of hanging when rendering never settles', async () => {
      const withTimeout = (service as any).withTimeout.bind(service);
      await expectAsync(
        withTimeout(new Promise(() => {}), 30, 'timed out')
      ).toBeRejectedWithError('timed out');
    });

    it('passes the value through when work finishes in time', async () => {
      const withTimeout = (service as any).withTimeout.bind(service);
      await expectAsync(withTimeout(Promise.resolve('ok'), 1000, 'timed out')).toBeResolvedTo('ok');
    });
  });
});
