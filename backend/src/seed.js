import { Store } from './store.js';

/** Sample records so a fresh deploy has something to search against. */
const SAMPLE = [
  { id: '1', name: 'John Doe', address: '12 Main Street', city: 'Johannesburg',
    postalCode: '2000', email: 'john.doe@example.com', phone: '+27 11 000 0001',
    referenceNumber: 'REF-2024-001', companyName: 'Doe Enterprises' },
  { id: '2', name: 'Jane Smith', address: '45 Oak Avenue', city: 'Cape Town',
    postalCode: '8001', email: 'jane.smith@example.com', phone: '+27 21 000 0002',
    referenceNumber: 'REF-2024-002' },
  { id: '3', name: 'Robert Johnson', address: '78 Pine Road', city: 'Durban',
    postalCode: '4001', email: 'r.johnson@example.com', phone: '+27 31 000 0003',
    referenceNumber: 'REF-2024-003', companyName: 'Johnson & Co' },
];

const store = new Store();
for (const c of SAMPLE) store.upsertClient(c);
console.log(`[formd] seeded ${SAMPLE.length} clients`);
store.close();
