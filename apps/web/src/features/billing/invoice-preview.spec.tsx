import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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
	it('checks the draft preview, then frames the pdf url and links the loaded copy', async () => {
		const asked: string[] = [];
		server.use(
			http.get('/api/invoices/:id/preview.pdf', ({ request }) => {
				asked.push(new URL(request.url).pathname);
				return pdf();
			})
		);
		render(wrap(<InvoicePreview invoiceId="inv-1" variant="draft" />));

		// a blob frame inherits object-src 'none' from the app and chrome then cuts the page off
		expect(await screen.findByTitle('PDF-Vorschau der Rechnung')).toHaveAttribute(
			'src',
			'/api/invoices/inv-1/preview.pdf'
		);
		expect(asked).toEqual(['/api/invoices/inv-1/preview.pdf']);
		expect(screen.getByRole('link', { name: 'PDF in neuem Tab öffnen' })).toHaveAttribute(
			'href',
			'blob:pdf-1'
		);
	});

	it('shows the issued document without a second way to open it', async () => {
		server.use(http.get('/api/invoices/:id/document', pdf));
		render(wrap(<InvoicePreview invoiceId="inv-1" variant="issued" />));

		expect(await screen.findByTitle('PDF-Vorschau der Rechnung')).toHaveAttribute(
			'src',
			'/api/invoices/inv-1/document'
		);
		expect(screen.queryByRole('link')).not.toBeInTheDocument();
	});

	it('says so when the preview fails and keeps the retry button focused while loading', async () => {
		let busy = true;
		let release = () => {};
		const held = new Promise<void>((resolve) => (release = resolve));
		server.use(
			http.get('/api/invoices/:id/preview.pdf', async () => {
				if (busy) {
					return HttpResponse.json(
						{ code: 'RENDER_BUSY', message: 'busy', details: null },
						{ status: 429 }
					);
				}
				await held;
				return pdf();
			})
		);
		render(wrap(<InvoicePreview invoiceId="inv-1" variant="draft" />));

		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Gerade werden zu viele Dokumente erstellt.'
		);
		expect(screen.queryByTitle('PDF-Vorschau der Rechnung')).not.toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'PDF in neuem Tab öffnen' })).toBeInTheDocument();

		busy = false;
		const retry = screen.getByRole('button', { name: 'Erneut versuchen' });
		await userEvent.click(retry);
		await waitFor(() => expect(retry).toHaveAttribute('data-pending'));
		expect(retry).toHaveFocus();

		release();
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
		const link = () => screen.getByRole('link', { name: 'PDF in neuem Tab öffnen' });
		await waitFor(() => expect(link()).toHaveAttribute('href', 'blob:pdf-1'));

		rerender(wrap(<InvoicePreview invoiceId="inv-1" variant="draft" version="a" />));
		expect(calls).toBe(1);

		rerender(wrap(<InvoicePreview invoiceId="inv-1" variant="draft" version="b" />));
		await waitFor(() => expect(link()).toHaveAttribute('href', 'blob:pdf-2'));
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
