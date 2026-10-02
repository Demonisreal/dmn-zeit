import { toCsv, type Cell } from '../exports/csv';
import type { TimeReport } from './time-report';

export type Download = { filename: string; body: string };

function rows(report: TimeReport): Cell[][] {
	return [
		['date', 'project', 'task', 'note', 'minutes', 'billable'],
		...report.entries.map((entry) => [
			entry.date,
			entry.projectName,
			entry.taskName ?? '',
			entry.note ?? '',
			entry.minutes,
			entry.billable ? 'x' : ''
		]),
		['', '', '', 'total', report.totals.minutes, ''],
		['', '', '', 'billable', report.totals.billableMinutes, '']
	];
}

export function renderTimeReportCsv(report: TimeReport): Download {
	const client = report.client.name.replace(/[^\w-]/g, '_');
	return {
		filename: `time-report-${report.period.from}-${report.period.to}-${client}.csv`,
		body: toCsv(rows(report), report.locale === 'de' ? ';' : ',')
	};
}
