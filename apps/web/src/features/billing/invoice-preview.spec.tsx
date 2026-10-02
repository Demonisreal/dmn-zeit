import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n';
import { queryClient } from '../../lib/api/query-client';
import { server } from '../../mocks/server';
import { InvoicePreview } from './invoice-preview';

beforeAll(() => i18n.loadNamespaces(['billing']));

const wrap = (node: ReactNode) => (
	<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
);

const pdf = () =>
	new HttpResponse(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), {
		headers: { 'Content-Type': 'application/pdf' }
	});

// jsdom has no object urls, a counter is enough to tell two renderings apart
let made = 0;
beforeEach(() => {
	made = 0;
	URL.createObjectURL = () => `blob:pdf-${++made}`;
	URL.revokeObjectURL = () => {};
});

afterEach(() => vi.restoreAllMocks());

describe('InvoicePreview', () => {
	it('loads the draft preview into the frame and keeps a visible link to the pdf', async () => {
		const asked: string[] = [];
		server.use(
			http.get('/api/invoices/:id/preview.pdf', ({ request }) => {
				asked.push(new URL(request.url).pathname);
				return pdf();
			})
		);
		render(wrap(<InvoicePreview invoiceId="inv-1" variant="draft" />));

		expect(await screen.findByTitle('PDF-Vorschau der Rechnung')).toHaveAttribute(
			'src',
			'blob:pdf-1'
		);
		expect(asked).toEqual(['/api/invoices/inv-1/preview.pdf']);
		expect(screen.getByRole('link', { name: 'PDF in neuem Tab öffnen' })).toHaveAttribute(
			'href',
			'/api/invoices/inv-1/preview.pdf'
		);
	});

	it('shows the issued document', async () => {
		server.use(http.get('/api/invoices/:id/document', pdf));
		render(wrap(<InvoicePreview invoiceId="inv-1" variant="issued" />));

		expect(await screen.findByTitle('PDF-Vorschau der Rechnung')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'PDF in neuem Tab öffnen' })).toHaveAttribute(
			'href',
			'/api/invoices/inv-1/document'
		);
	});

	it('says so when the preview fails and loads it on retry', async () => {
		let busy = true;
		server.use(
			http.get('/api/invoices/:id/preview.pdf', () =>
				busy
					? HttpResponse.json(
							{ code: 'RENDER_BUSY', message: 'busy', details: null },
							{ status: 429 }
						)
					: pdf()
			)
		);
		render(wrap(<InvoicePreview invoiceId="inv-1" variant="draft" />));

		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Gerade werden zu viele Dokumente erstellt.'
		);
		expect(screen.queryByTitle('PDF-Vorschau der Rechnung')).not.toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'PDF in neuem Tab öffnen' })).toBeInTheDocument();

		busy = false;
		await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
		expect(await screen.findByTitle('PDF-Vorschau der Rechnung')).toBeInTheDocument();
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});

	it('renders again only when the version changes', async () => {
		let calls = 0;
		server.use(
			http.get('/api/invoices/:id/preview.pdf', () => {
				calls += 1;
				return pdf();
			})
		);
		const { rerender } = render(
			wrap(<InvoicePreview invoiceId="inv-1" variant="draft" version="a" />)
		);
		expect(await screen.findByTitle('PDF-Vorschau der Rechnung')).toHaveAttribute(
			'src',
			'blob:pdf-1'
		);

		rerender(wrap(<InvoicePreview invoiceId="inv-1" variant="draft" version="a" />));
		expect(calls).toBe(1);

		rerender(wrap(<InvoicePreview invoiceId="inv-1" variant="draft" version="b" />));
		expect(await screen.findByTitle('PDF-Vorschau der Rechnung')).toHaveAttribute(
			'src',
			'blob:pdf-2'
		);
		expect(calls).toBe(2);
	});

	it('offers the pdf as a link instead of a frame on touch screens', () => {
		const plain = window.matchMedia('');
		vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
			...plain,
			matches: query === '(pointer: coarse)'
		}));
		render(wrap(<InvoicePreview invoiceId="inv-1" variant="draft" />));

		expect(screen.queryByTitle('PDF-Vorschau der Rechnung')).not.toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'PDF in neuem Tab öffnen' })).toHaveAttribute(
			'href',
			'/api/invoices/inv-1/preview.pdf'
		);
	});
});
