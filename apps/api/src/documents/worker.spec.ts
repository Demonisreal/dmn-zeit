import { describe, expect, it } from 'vitest';
import { invoiceFixture } from './invoice.fixture';
import { timeReportFixture } from './time-report.fixture';
import { renderJob } from './worker';

const complete = invoiceFixture({
	seller: { ...invoiceFixture().seller, contactPhone: '0221 4710-318' },
	buyer: {
		...invoiceFixture().buyer,
		email: 'rechnung@nordlicht.example',
		buyerReference: '04011000-12345-03'
	}
});

const formatsOf = (documents: { format: string }[]) => documents.map((document) => document.format);

describe('renderJob', () => {
	it('renders a plain invoice into one pdf', async () => {
		const documents = await renderJob({ kind: 'invoice', invoice: complete, format: 'pdf' });
		expect(formatsOf(documents)).toEqual(['pdf']);
		expect(documents[0]!.content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
	});

	it('turns the invoice pdf into a zugferd pdf instead of storing both', async () => {
		const documents = await renderJob({ kind: 'invoice', invoice: complete, format: 'zugferd' });
		expect(formatsOf(documents)).toEqual(['zugferd']);
		expect(documents[0]!.content.toString('latin1')).toContain('factur-x.xml');
	});

	it('hands back the xrechnung xml as utf-8 together with a pdf to read', async () => {
		const documents = await renderJob({ kind: 'invoice', invoice: complete, format: 'xrechnung' });
		expect(formatsOf(documents)).toEqual(['xrechnung_cii', 'pdf']);
		const xml = documents[0]!.content.toString('utf8');
		expect(xml).toContain('<rsm:CrossIndustryInvoice');
		expect(xml).toContain('<ram:CityName>Düsseldorf</ram:CityName>');
		expect(documents[1]!.content.toString('latin1')).not.toContain('factur-x.xml');
	});

	it('refuses an xrechnung the blockers would have stopped', async () => {
		const bare = { ...complete, buyer: { ...complete.buyer, buyerReference: null } };
		await expect(
			renderJob({ kind: 'invoice', invoice: bare, format: 'xrechnung' })
		).rejects.toThrow('buyer_reference_missing');
	});

	it('renders a time report as its own pdf', async () => {
		const documents = await renderJob({ kind: 'time-report-pdf', report: timeReportFixture() });
		expect(formatsOf(documents)).toEqual(['time_report_pdf']);
	});
});
