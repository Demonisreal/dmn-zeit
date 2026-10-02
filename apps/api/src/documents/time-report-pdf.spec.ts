import { describe, expect, it } from 'vitest';
import { pdfParse } from './pdf-parse.fixture';
import { buildTimeReportPdf } from './time-report-pdf';
import { timeReportFixture } from './time-report.fixture';

const flat = (raw: string) => raw.replace(/\s+/g, ' ').trim();

describe('buildTimeReportPdf', () => {
	it('starts with the pdf signature and lists client, project and entries', async () => {
		const buffer = await buildTimeReportPdf(timeReportFixture());
		expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
		const { text } = await pdfParse(buffer);
		expect(flat(text)).toContain('Agentur Nordlicht GmbH');
		expect(flat(text)).toContain('Relaunch');
		expect(flat(text)).toContain('480 Min.');
	});

	it('never carries an absence type or another customer, only the given bookings', async () => {
		const buffer = await buildTimeReportPdf(
			timeReportFixture({
				entries: [
					{ date: '2026-08-04', projectName: 'Relaunch', taskName: null, note: null, minutes: 60, billable: true }
				]
			})
		);
		const { text } = await pdfParse(buffer);
		expect(text.toLowerCase()).not.toContain('krank');
		expect(text.toLowerCase()).not.toContain('urlaub');
	});
});
