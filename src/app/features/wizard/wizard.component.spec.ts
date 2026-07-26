import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { WizardComponent } from './wizard.component';
import { Client } from '../../core/models/client.model';
import { provideFormd } from '../../core/config/provide-formd';

const CLIENT_A: Client = {
  id: '1', name: 'John Doe', address: '12 Main Street', city: 'Johannesburg',
  postalCode: '2000', email: 'john.doe@example.com', phone: '+27 11 000 0001',
  referenceNumber: 'REF-2024-001',
};

const CLIENT_B: Client = {
  id: '2', name: 'Jane Smith', address: '45 Oak Avenue', city: 'Cape Town',
  postalCode: '8001', email: 'jane.smith@example.com', phone: '+27 21 000 0002',
  referenceNumber: 'REF-2024-002',
};

describe('WizardComponent', () => {
  let fixture: ComponentFixture<WizardComponent>;
  let component: WizardComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WizardComponent, NoopAnimationsModule],
      providers: [provideHttpClient(), provideFormd()],
    }).compileComponents();

    fixture = TestBed.createComponent(WizardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('starts with no client and no signature', () => {
    expect(component.selectedClient).toBeNull();
    expect(component.signatureDataUrl).toBeNull();
  });

  it('records the selected client', () => {
    component.onClientSelected(CLIENT_A);
    expect(component.selectedClient).toBe(CLIENT_A);
  });

  it('records the captured signature', () => {
    component.onSignatureChange('data:image/png;base64,AAAA');
    expect(component.signatureDataUrl).toBe('data:image/png;base64,AAAA');
  });

  // Without this, a signature captured for one client stays valid after
  // switching to another — the wrong person's mark on the wrong agreement.
  it('invalidates the signature when a different client is selected', () => {
    component.onClientSelected(CLIENT_A);
    component.onSignatureChange('data:image/png;base64,AAAA');
    expect(component.signatureDataUrl).not.toBeNull();

    component.onClientSelected(CLIENT_B);

    expect(component.selectedClient).toBe(CLIENT_B);
    expect(component.signatureDataUrl).toBeNull();
  });

  it('clears both client and signature on reset', () => {
    component.onClientSelected(CLIENT_A);
    component.onSignatureChange('data:image/png;base64,AAAA');

    component.reset(component.stepper);

    expect(component.selectedClient).toBeNull();
    expect(component.signatureDataUrl).toBeNull();
  });

  it('clears the client search child on reset', () => {
    component.onClientSelected(CLIENT_A);
    fixture.detectChanges();
    const child = component.clientSearchRef;
    expect(child).toBeTruthy();

    const childReset = spyOn(child, 'reset').and.callThrough();
    component.reset(component.stepper);

    expect(childReset).toHaveBeenCalled();
  });
});
