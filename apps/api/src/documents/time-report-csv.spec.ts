import { describe, expect, it } from 'vitest';
import { renderTimeReportCsv } from './time-report-csv';
import { timeReportFixture } from './time-report.fixture';

describe('renderTimeReportCsv', () => {
	it('starts with the byte order mark and keeps minutes as a number, not a defused string', () => {
		const { body } = renderTimeReportCsv(
			timeReportFixture({
				entries: [
					{
						date: '2026-08-04',
						projectName: 'Relaunch',
						taskName: null,
						note: null,
						minutes: -15,
						billable: false
					}
				]
			})
		);
		expect(body.startsWith('﻿')).toBe(true);
		// B7: a defused '-15 would no longer be a number in the spreadsheet
		expect(body).toContain(';-15;');
		expect(body).not.toContain("'-15");
	});

	it('marks the report of a sandbox as specimen in the last row, like the pdf', () => {
		const lastRow = (body: string) => body.trimEnd().split('\r\n').at(-1);
		expect(lastRow(renderTimeReportCsv(timeReportFixture({ specimen: true })).body)).toBe(
			';;;Muster – Stundennachweis aus dem Musterbetrieb;;'
		);
		expect(
			lastRow(renderTimeReportCsv(timeReportFixture({ specimen: true, locale: 'en' })).body)
		).toBe(',,,Specimen – time report from the demo company,,');
		expect(lastRow(renderTimeReportCsv(timeReportFixture()).body)).toBe(';;;billable;480;');
	});

	it('names the file after the period and the client', () => {
		const { filename } = renderTimeReportCsv(timeReportFixture());
		expect(filename).toBe('time-report-2026-08-01-2026-08-31-Agentur_Nordlicht_GmbH.csv');
	});
});
