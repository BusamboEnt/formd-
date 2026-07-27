import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { FormOverlayComponent } from './form-overlay.component';
import { FormDefinition } from '../../core/models/form-definition.model';
import { FormField } from '../../core/models/form-field.model';

/**
 * Specs for the gate on the Sign & Save button.
 *
 * The gate read `required` and nothing else, and extractFormDefinition never
 * emitted that flag — so `[].every(...)` returned true and a document could be
 * submitted with its signature box empty. A saved contract carrying no
 * signature is the one outcome this product cannot produce.
 *
 * The definition here carries no document url, so nothing is rendered and
 * pdf.js is never loaded — these test the gate, not the overlay's drawing.
 */
describe('FormOverlayComponent completeness gate', () => {
  let fixture: ComponentFixture<FormOverlayComponent>;
  let component: FormOverlayComponent;
  let complete: boolean | undefined;

  function field(partial: Partial<FormField> & { id: string }): FormField {
    return {
      kind: 'text',
      label: partial.id,
      rect: { page: 0, x: 0, y: 0, width: 100, height: 20 },
      ...partial,
    } as FormField;
  }

  function definitionWith(fields: FormField[]): FormDefinition {
    return {
      id: 'def-1',
      title: 'Supply Agreement',
      version: '1.0.0',
      document: {
        url: '',
        filename: 'supply.pdf',
        contentType: 'application/pdf',
        pages: [{ width: 595, height: 842 }],
        sha256: 'x',
      },
      fields,
      origin: { source: 'acroform', originalFilename: 'supply.pdf', importedAt: '' },
    } as FormDefinition;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormOverlayComponent],
      providers: [provideNoopAnimations()],
    }).compileComponents();

    fixture = TestBed.createComponent(FormOverlayComponent);
    component = fixture.componentInstance;
    complete = undefined;
    component.completeChange.subscribe((v: boolean) => (complete = v));
  });

  /** Applies the definition and drains the setTimeout the emit is deferred by. */
  function settle(definition: FormDefinition): void {
    component.definition = definition;
    component.ngOnChanges();
    fixture.detectChanges();
    tick();
  }

  it('blocks submission while the only signature field is empty', fakeAsync(() => {
    settle(
      definitionWith([
        field({ id: 'client.name' }),
        field({ id: 'client.signature', kind: 'signature' }),
      ])
    );

    expect(complete).withContext('an unsigned document must not be submittable').toBeFalse();
  }));

  it('allows submission once that signature is captured', fakeAsync(() => {
    const signature = field({ id: 'client.signature', kind: 'signature' });
    settle(definitionWith([field({ id: 'client.name' }), signature]));

    component.set(signature, 'data:image/png;base64,AAAA');
    tick();

    expect(complete).toBeTrue();
  }));

  it('treats initials as a signature for this purpose', fakeAsync(() => {
    settle(definitionWith([field({ id: 'page.initials', kind: 'initials' })]));
    expect(complete).toBeFalse();
  }));

  // A witness or co-signer box is an option, not a second obligation.
  it('needs only one signature when the document offers two', fakeAsync(() => {
    const client = field({ id: 'client.signature', kind: 'signature' });
    settle(definitionWith([client, field({ id: 'witness.signature', kind: 'signature' })]));

    component.set(client, 'data:image/png;base64,AAAA');
    tick();

    expect(complete).toBeTrue();
  }));

  it('allows submission for a document with no signature field at all', fakeAsync(() => {
    settle(definitionWith([field({ id: 'client.name' })]));
    expect(complete).toBeTrue();
  }));

  it('still blocks a required text field left blank', fakeAsync(() => {
    const signature = field({ id: 'client.signature', kind: 'signature' });
    settle(definitionWith([field({ id: 'client.name', required: true }), signature]));

    component.set(signature, 'data:image/png;base64,AAAA');
    tick();

    expect(complete).withContext('the required-field check must still apply').toBeFalse();
  }));
});
