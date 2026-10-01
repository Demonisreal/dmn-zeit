import type { TimeReport } from './time-report';

export function timeReportFixture(overrides: Partial<TimeReport> = {}): TimeReport {
	return {
		locale: 'de',
		client: { name: 'Agentur Nordlicht GmbH', number: 'K-0042' },
		project: { name: 'Relaunch', code: 'RELAUNCH' },
		period: { from: '2026-08-01', to: '2026-08-31' },
		generatedAt: '2026-09-01T09:00:00+02:00',
		entries: [
			{
				date: '2026-08-04',
				projectName: 'Relaunch',
				taskName: 'Umsetzung',
				note: 'Startseite',
				minutes: 480,
				billable: true
			}
		],
		totals: { minutes: 480, billableMinutes: 480 },
		...overrides
	};
}
