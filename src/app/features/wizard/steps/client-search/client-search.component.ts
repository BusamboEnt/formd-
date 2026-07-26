import { Component, EventEmitter, inject, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';
import { of } from 'rxjs';
import { Client } from '../../../../core/models/client.model';
import { FORMD_CLIENT_SOURCE } from '../../../../core/config/formd.config';

@Component({
  selector: 'app-client-search',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatIconModule,
  ],
  template: `
    <div class="step-content">
      <h2 class="step-title">Find Client</h2>
      <p class="step-subtitle">Search by client name or reference number.</p>

      <mat-form-field appearance="outline" class="search-field">
        <mat-label>Search client</mat-label>
        <input
          matInput
          [formControl]="searchCtrl"
          [matAutocomplete]="auto"
          placeholder="e.g. John Doe or REF-2024-001"
        />
        <mat-spinner diameter="20" matSuffix *ngIf="loading"></mat-spinner>
        <mat-icon matSuffix *ngIf="!loading">search</mat-icon>
        <mat-autocomplete
          #auto="matAutocomplete"
          [displayWith]="displayFn"
          (optionSelected)="onClientSelected($event.option.value)"
        >
          <mat-option *ngFor="let client of results" [value]="client">
            <div class="option-content">
              <span class="option-name">{{ client.name }}</span>
              <span class="option-ref">{{ client.referenceNumber }}</span>
            </div>
          </mat-option>
          <mat-option disabled *ngIf="results.length === 0 && searched && !loading && !searchFailed">
            <div class="empty-state">
              <mat-icon>search_off</mat-icon>
              <span>No clients matched your search</span>
            </div>
          </mat-option>
        </mat-autocomplete>
      </mat-form-field>

      <!-- A broken lookup must not read as "this client does not exist". -->
      <div class="search-failed" *ngIf="searchFailed">
        <mat-icon>cloud_off</mat-icon>
        <span>Could not reach the client service. Check the connection and try again.</span>
      </div>

      <mat-card *ngIf="selectedClient" class="client-card" appearance="outlined">
        <mat-card-header>
          <mat-icon mat-card-avatar class="avatar-icon">person</mat-icon>
          <mat-card-title>{{ selectedClient.name }}</mat-card-title>
          <mat-card-subtitle>{{ selectedClient.referenceNumber }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="detail-grid">
            <div class="detail-item" *ngIf="selectedClient.companyName">
              <mat-icon>business</mat-icon>
              <span>{{ selectedClient.companyName }}</span>
            </div>
            <div class="detail-item">
              <mat-icon>location_on</mat-icon>
              <span>{{ selectedClient.address }}, {{ selectedClient.city }}, {{ selectedClient.postalCode }}</span>
            </div>
            <div class="detail-item">
              <mat-icon>email</mat-icon>
              <span>{{ selectedClient.email }}</span>
            </div>
            <div class="detail-item">
              <mat-icon>phone</mat-icon>
              <span>{{ selectedClient.phone }}</span>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .step-content { padding: 8px 0; }
    .step-title { margin: 0 0 4px; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
    .step-subtitle { margin: 0 0 24px; color: var(--muted-foreground); }
    .search-field { width: 100%; }
    .option-content { display: flex; justify-content: space-between; align-items: center; width: 100%; }
    .option-name { font-weight: 500; }
    .option-ref { font-size: 12px; color: var(--muted-foreground); }
    .client-card { margin-top: 20px; }
    .avatar-icon { font-size: 40px; width: 40px; height: 40px; color: var(--foreground); }
    .detail-grid { display: flex; flex-direction: column; gap: 10px; padding-top: 8px; }
    .detail-item { display: flex; align-items: center; gap: 10px; color: var(--foreground); }
    .detail-item mat-icon { color: var(--muted-foreground); font-size: 18px; width: 18px; height: 18px; }
    .empty-state { display: flex; align-items: center; gap: 8px; color: var(--muted-foreground); }
    .search-failed { display: flex; align-items: center; gap: 8px; color: var(--destructive); font-size: 14px; margin-top: 4px; }
  `],
})
export class ClientSearchComponent implements OnInit {
  @Output() clientSelected = new EventEmitter<Client | null>();

  private clientService = inject(FORMD_CLIENT_SOURCE);

  searchCtrl = new FormControl('');
  results: Client[] = [];
  selectedClient: Client | null = null;
  searched = false;
  loading = false;
  searchFailed = false;

  ngOnInit(): void {
    this.searchCtrl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      tap(() => { this.loading = true; this.searched = false; this.searchFailed = false; }),
      switchMap((value) => {
        if (typeof value === 'string' && value.trim().length >= 2) {
          // Caught here rather than upstream so one failed request does not
          // terminate the stream and leave the field permanently dead.
          return this.clientService.searchClients(value.trim()).pipe(
            catchError((err) => {
              console.error('FormD: client search failed', err);
              this.searchFailed = true;
              return of([]);
            })
          );
        }
        return of([]);
      })
    ).subscribe((clients) => {
      this.results = clients;
      this.loading = false;
      this.searched = true;
    });
  }

  reset(): void {
    this.searchCtrl.setValue('');
    this.results = [];
    this.selectedClient = null;
    this.searched = false;
    this.loading = false;
    this.searchFailed = false;
    this.clientSelected.emit(null);
  }

  displayFn(client: Client | string): string {
    return typeof client === 'object' && client ? client.name : (client as string) ?? '';
  }

  onClientSelected(client: Client): void {
    this.selectedClient = client;
    this.clientSelected.emit(client);
  }
}
