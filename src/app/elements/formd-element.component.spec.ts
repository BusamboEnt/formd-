import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { FormdElementComponent } from './formd-element.component';
import { provideFormdElement } from './provide-formd-element';
import { FormFillComponent } from '../features/form-fill/form-fill.component';

/**
 * The custom element is the distributable product — an Angular host importing
 * WizardComponent directly never exercises this class. It shipped rendering
 * only the clause wizard, so a host that had imported a document could not
 * reach that flow at all: the feature existed, and nothing embedding FormD
 * could open it. These specs pin which flow each configuration selects.
 */
describe('FormdElementComponent', () => {
  let fixture: ComponentFixture<FormdElementComponent>;
  let component: FormdElementComponent;

  beforeEach(async () => {
    // FormFillComponent fetches its definition on init. Stubbed so these
    // specs test which flow mounts, not what the backend says.
    //
    // callFake, not returnValue: the latter builds one rejected promise when
    // the spy is installed, which goes unhandled in every spec that never
    // reaches a fetch.
    spyOn(window, 'fetch').and.callFake(() =>
      Promise.resolve(new Response('not found', { status: 404 }))
    );

    await TestBed.configureTestingModule({
      imports: [FormdElementComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideFormdElement(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FormdElementComponent);
    component = fixture.componentInstance;
  });

  /** Applies inputs the way Angular Elements does, then settles the view. */
  async function apply(): Promise<void> {
    component.ngOnChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function query(selector: string): unknown {
    return (fixture.nativeElement as HTMLElement).querySelector(selector);
  }

  it('renders the clause wizard when no form id is set', async () => {
    await apply();
    expect(query('app-wizard')).withContext('clause wizard').not.toBeNull();
    expect(query('app-form-fill')).toBeNull();
  });

  it('renders the document flow instead of the wizard when a form id is set', async () => {
    component.formId = 'form-123';
    await apply();

    expect(query('app-form-fill')).withContext('document flow').not.toBeNull();
    expect(query('app-wizard'))
      .withContext('the clause wizard must not render alongside a document')
      .toBeNull();
  });

  it('passes the form id and backend url down to the document flow', async () => {
    component.formId = 'form-abc';
    component.apiBaseUrl = 'https://api.example.test';
    await apply();

    // Read them off the created component: these are set with setInput(), so
    // they leave no attribute on the DOM to assert against.
    const mounted = fixture.debugElement.queryAll(By.directive(FormFillComponent));
    expect(mounted.length).toBe(1);
    expect(mounted[0].componentInstance.formId).toBe('form-abc');
    expect(mounted[0].componentInstance.apiBaseUrl).toBe('https://api.example.test');
  });

  it('swaps back to the clause wizard when the form id is cleared', async () => {
    component.formId = 'form-123';
    await apply();
    expect(query('app-form-fill')).not.toBeNull();

    component.formId = undefined;
    await apply();

    expect(query('app-form-fill')).toBeNull();
    expect(query('app-wizard')).not.toBeNull();
  });

  it('does not mount a second copy when unrelated configuration changes', async () => {
    component.formId = 'form-123';
    await apply();

    component.branding = { name: 'ACME' };
    await apply();

    expect(fixture.debugElement.queryAll(By.directive(FormFillComponent)).length).toBe(1);
  });
});
