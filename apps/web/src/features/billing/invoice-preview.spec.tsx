import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { i18n } from '../../i18n';
import { InvoicePreview } from './invoice-preview';

beforeAll(() => i18n.loadNamespaces(['billing']));

describe('InvoicePreview', () => {
	it('points the frame at the draft preview route', () => {
		render(<InvoicePreview invoiceId="inv-1" variant="draft" />);

		const frame = screen.getByTitle('PDF-Vorschau der Rechnung');
		expect(frame).toHaveAttribute('src', '/api/invoices/inv-1/preview.pdf');
	});

	it('points the frame at the issued document route', () => {
		render(<InvoicePreview invoiceId="inv-1" variant="issued" />);

		const frame = screen.getByTitle('PDF-Vorschau der Rechnung');
		expect(frame).toHaveAttribute('src', '/api/invoices/inv-1/document');
	});

	it('remounts the frame when refreshKey changes', () => {
		const { rerender } = render(
			<InvoicePreview invoiceId="inv-1" variant="draft" refreshKey="a" />
		);
		const first = screen.getByTitle('PDF-Vorschau der Rechnung');

		rerender(<InvoicePreview invoiceId="inv-1" variant="draft" refreshKey="b" />);
		const second = screen.getByTitle('PDF-Vorschau der Rechnung');

		expect(second).not.toBe(first);
	});
});
