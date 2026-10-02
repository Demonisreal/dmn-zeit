import type { Invoice, InvoiceLine, TaxGroup } from '@zeit/shared';

const line = (overrides: Partial<InvoiceLine> = {}): InvoiceLine => ({
	id: '11111111-1111-1111-1111-111111111111',
	position: 1,
	kind: 'time',
	projectId: '22222222-2222-2222-2222-222222222222',
	taskId: null,
	description: 'Relaunch Website, Umsetzung Startseite',
	serviceFrom: '2026-08-01',
	serviceTo: '2026-08-31',
	minutes: 480,
	quantityMilli: null,
	unit: null,
	unitPriceCents: '9500',
	netCents: '76000',
	taxCategory: 'standard',
	taxRateBp: 1900,
	exemptionReason: null,
	derivation: {
		entries: [{ id: 'e1', startedAt: '2026-08-04T08:00:00+02:00', endedAt: '2026-08-04T16:00:00+02:00' }],
		rounding: { key: 'billing.rounding.up', params: { raw: 473, increment: 15, rounded: 480 } },
		rate: {
			cents: '9500',
			explanation: { key: 'billing.rate.client', params: { cents: '9500', validFrom: '2026-01-01' } }
		}
	},
	...overrides
});

const taxGroup = (overrides: Partial<TaxGroup> = {}): TaxGroup => ({
	taxCategory: 'standard',
	taxRateBp: 1900,
	netCents: '76000',
	taxCents: '14440',
	explanation: {
		key: 'billing.totals.group',
		params: { taxCategory: 'standard', taxRateBp: 1900, netCents: '76000', taxCents: '14440' }
	},
	...overrides
});

// a full, schema-valid regelbesteuert invoice; tests override only the fields their case needs
export function invoiceFixture(overrides: Partial<Invoice> = {}): Invoice {
	return {
		id: '33333333-3333-3333-3333-333333333333',
		kind: 'invoice',
		status: 'issued',
		specimen: false,
		clientId: '44444444-4444-4444-4444-444444444444',
		refersTo: null,
		cancellation: null,
		number: 'RE-2026-0007',
		numberYear: 2026,
		numberSeq: 7,
		issueDate: '2026-09-01',
		dueDate: '2026-09-15',
		serviceFrom: '2026-08-01',
		serviceTo: '2026-08-31',
		paymentTermsDays: 14,
		locale: 'de',
		format: 'pdf',
		taxProfile: 'regular',
		treatment: 'standard',
		seller: {
			legalName: 'Lena Vogt – Softwareentwicklung',
			street: 'Musterweg 1',
			postalCode: '40210',
			city: 'Düsseldorf',
			countryCode: 'DE',
			taxNumber: '123/4567/8901',
			vatId: 'DE123456789',
			iban: 'DE79000000001234567890',
			bic: 'BEISDEF0XXX',
			bankName: 'Musterbank',
			contactName: 'Lena Vogt',
			contactEmail: 'lena@example.test',
			contactPhone: null,
			registerCourt: null,
			registerNumber: null
		},
		buyer: {
			name: 'Agentur Nordlicht GmbH',
			street: 'Hafenstraße 12',
			postalCode: '20359',
			city: 'Hamburg',
			countryCode: 'DE',
			isBusiness: true,
			vatId: 'DE987654321',
			email: null,
			buyerReference: null,
			number: 'K-0042'
		},
		introText: null,
		closingText: 'Vielen Dank für die gute Zusammenarbeit.',
		lines: [line()],
		taxGroups: [taxGroup()],
		totals: {
			netCents: '76000',
			taxCents: '14440',
			grossCents: '90440',
			explanation: {
				key: 'billing.totals',
				params: { netCents: '76000', taxCents: '14440', grossCents: '90440' }
			}
		},
		legalNotes: [],
		blockers: [],
		hints: [],
		paidOn: null,
		cancelReason: null,
		cancelledAt: null,
		cancelledBy: null,
		issuedAt: '2026-09-01T09:00:00+02:00',
		issuedBy: { id: '55555555-5555-5555-5555-555555555555', displayName: 'Lena Vogt' },
		createdBy: { id: '55555555-5555-5555-5555-555555555555', displayName: 'Lena Vogt' },
		createdAt: '2026-08-31T10:00:00+02:00',
		updatedAt: '2026-09-01T09:00:00+02:00',
		retainUntil: '2034-12-31',
		...overrides
	};
}

export { line as invoiceLineFixture, taxGroup as taxGroupFixture };
