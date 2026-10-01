import { toCsv, type Cell } from '../exports/csv';
import type { TimeReport } from './time-report';

// same shape as exports/exports.service.ts#Download, kept local so exports/ can depend on
// documents/ without a cycle back
export type Download = { filename: string; body: string };

function rows(report: TimeReport): Cell[][] {
	return [
		['date', 'project', 'task', 'note', 'minutes', 'billable'],
		// minutes stay a number so a negative correction on a golden-file test never needs the
		// leading-quote defusing that text amounts do (befund B7)
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
