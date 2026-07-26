import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { AppComponent } from './app.component';
import { LoadingService } from './core/services/loading.service';

// Deliberately no NO_ERRORS_SCHEMA. The previous version of this spec used it,
// which silently swallowed the fact that AppComponent used *ngIf without
// importing NgIf — so the toolbar progress bar never rendered and the suite
// still passed. Unknown elements and bindings should fail these tests.
describe('AppComponent', () => {
  let loading: LoadingService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, NoopAnimationsModule],
      providers: [provideRouter([])],
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

  it('contains a router outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('router-outlet')).toBeTruthy();
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
