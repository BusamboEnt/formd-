import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, finalize, delay } from 'rxjs/operators';
import { Client } from '../models/client.model';
import { LoadingService } from './loading.service';
import { environment } from '../../../environments/environment';

const MOCK_CLIENTS: Client[] = [
  {
    id: '1',
    name: 'John Doe',
    address: '12 Main Street',
    city: 'Johannesburg',
    postalCode: '2000',
    email: 'john.doe@example.com',
    phone: '+27 11 000 0001',
    referenceNumber: 'REF-2024-001',
    companyName: 'Doe Enterprises',
  },
  {
    id: '2',
    name: 'Jane Smith',
    address: '45 Oak Avenue',
    city: 'Cape Town',
    postalCode: '8001',
    email: 'jane.smith@example.com',
    phone: '+27 21 000 0002',
    referenceNumber: 'REF-2024-002',
  },
  {
    id: '3',
    name: 'Robert Johnson',
    address: '78 Pine Road',
    city: 'Durban',
    postalCode: '4001',
    email: 'r.johnson@example.com',
    phone: '+27 31 000 0003',
    referenceNumber: 'REF-2024-003',
    companyName: 'Johnson & Co',
  },
  {
    id: '4',
    name: 'Emily Davis',
    address: '22 Elm Street',
    city: 'Pretoria',
    postalCode: '0001',
    email: 'emily.davis@example.com',
    phone: '+27 12 000 0004',
    referenceNumber: 'REF-2024-004',
  },
  {
    id: '5',
    name: 'Michael Brown',
    address: '5 Maple Lane',
    city: 'Bloemfontein',
    postalCode: '9301',
    email: 'm.brown@example.com',
    phone: '+27 51 000 0005',
    referenceNumber: 'REF-2024-005',
    companyName: 'Brown Solutions',
  },
];

@Injectable({ providedIn: 'root' })
export class ClientService {
  private http = inject(HttpClient);
  private loading = inject(LoadingService);

  searchClients(query: string): Observable<Client[]> {
    this.loading.show();

    if (environment.useMockData) {
      const lower = query.toLowerCase();
      const results = MOCK_CLIENTS.filter(
        (c) =>
          c.name.toLowerCase().includes(lower) ||
          c.referenceNumber.toLowerCase().includes(lower) ||
          (c.companyName?.toLowerCase().includes(lower) ?? false)
      );
      // Brief artificial delay so the loading indicator is visible in mock mode
      return of(results).pipe(
        delay(400),
        finalize(() => this.loading.hide())
      );
    }

    return this.http
      .get<Client[]>(`${environment.apiBaseUrl}/clients`, {
        params: { search: query },
      })
      .pipe(
        catchError(() => of([])),
        finalize(() => this.loading.hide())
      );
  }

  getClientById(id: string): Observable<Client | undefined> {
    if (environment.useMockData) {
      return of(MOCK_CLIENTS.find((c) => c.id === id));
    }

    return this.http
      .get<Client>(`${environment.apiBaseUrl}/clients/${id}`)
      .pipe(catchError(() => of(undefined)));
  }
}
