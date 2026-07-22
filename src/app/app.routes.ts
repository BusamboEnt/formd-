import { Routes } from '@angular/router';
import { WizardComponent } from './features/wizard/wizard.component';

export const routes: Routes = [
  { path: '', component: WizardComponent },
  { path: '**', redirectTo: '' },
];
