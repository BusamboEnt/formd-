import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { AppComponent } from './app.component';
import { LoadingService } from './core/services/loading.service';
import { provideFormd } from './core/config/provide-formd';

// Deliberately no NO_ERRORS_SCHEMA. The previous version of this spec used it,
// which silently swallowed the fact that AppComponent used *ngIf without
// importing NgIf — so the toolbar progress bar never rendered and the suite
// still passed. Unknown elements and bindings should fail these tests.
describe('AppComponent', () => {
  let loading: LoadingService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, NoopAnimationsModule],
      providers: [provideHttpClient(),provideFormd()],
    }).compileComponents();
    loading = TestBed.inject(LoadingService);
  });

  it('creates the app', () => {
    expect(TestBed.createComponent(AppComponent).componentInstance).toBeTruthy();
  });

  it('renders the FormD toolbar brand', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('mat-toolbar')).toBeTruthy();
    expect(el.querySelector('.toolbar-logo')?.textContent).toContain('FormD');
  });

  it('renders the wizard directly', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-wizard')).toBeTruthy();
  });

  it('hides the progress bar while idle', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('mat-progress-bar')).toBeNull();
  });

  it('shows the progress bar while loading', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    loading.show();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('mat-progress-bar')).toBeTruthy();
  });

  it('hides the progress bar again once loading finishes', () => {
    const fixture = TestBed.createComponent(AppComponent);
    loading.show();
    fixture.detectChanges();

    loading.hide();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('mat-progress-bar')).toBeNull();
  });

});

// Proves an override reaches the rendered DOM, not merely the token.
describe('AppComponent branding overrides', () => {
  async function render(branding: Parameters<typeof provideFormd>[0]) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AppComponent, NoopAnimationsModule],
      providers: [provideHttpClient(),provideFormd(branding)],
    }).compileComponents();
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders a supplied brand name', async () => {
    const el = await render({ branding: { name: 'ACME' } });
    expect(el.querySelector('.toolbar-logo')?.textContent).toContain('ACME');
  });

  it('renders a supplied tagline', async () => {
    const el = await render({ branding: { name: 'ACME', tagline: 'Supply Contracts' } });
    expect(el.querySelector('.toolbar-subtitle')?.textContent).toContain('Supply Contracts');
  });

  it('keeps the default tagline when only the name is overridden', async () => {
    const el = await render({ branding: { name: 'ACME' } });
    expect(el.querySelector('.toolbar-subtitle')?.textContent).toContain('Digital Signing System');
  });

  it('drops the tagline element entirely when set empty', async () => {
    const el = await render({ branding: { tagline: '' } });
    expect(el.querySelector('.toolbar-subtitle')).toBeNull();
  });
});
