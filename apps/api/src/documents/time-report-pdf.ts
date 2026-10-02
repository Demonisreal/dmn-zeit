import PDFDocument from 'pdfkit';
import { formatDate } from './format';
import { BOLD_FONT, REGULAR_FONT } from './fonts';
import { labelsFor } from './labels';
import { drawWatermark, escapeXmp, limitPages } from './pdf';
import type { TimeReport } from './time-report';

const MM = 72 / 25.4;
const mm = (value: number) => value * MM;

const LEFT_MM = 25;
const RIGHT_MM = 20;
const TOP_MM = 25;
const BOTTOM_MM = 20;
const CONTENT_WIDTH_MM = 210 - LEFT_MM - RIGHT_MM;

function subjectLine(report: TimeReport, labels: ReturnType<typeof labelsFor>): string {
	const parts = [labels.client + ': ' + report.client.name];
	if (report.project) parts.push(`${labels.project}: ${report.project.name}`);
	return parts.join(' · ');
}

export async function buildTimeReportPdf(report: TimeReport): Promise<Buffer> {
	const labels = labelsFor(report.locale);
	const doc = new PDFDocument({
		size: 'A4',
		margins: { top: mm(TOP_MM), bottom: mm(BOTTOM_MM), left: mm(LEFT_MM), right: mm(RIGHT_MM) },
		bufferPages: true,
		pdfVersion: '1.7',
		tagged: true,
		lang: report.locale,
		subset: 'PDF/A-3b',
		info: {
			Title: `${labels.timeReport} ${report.client.name}`,
			Author: report.client.name,
			CreationDate: new Date(report.generatedAt)
		}
	});
	escapeXmp(doc);
	limitPages(doc);

	doc.font(BOLD_FONT).fontSize(16).text(labels.timeReport);
	doc.font(REGULAR_FONT).fontSize(10).fillColor('#333333').text(subjectLine(report, labels));
	doc
		.fontSize(9)
		.text(
			`${formatDate(report.period.from, report.locale)} – ${formatDate(report.period.to, report.locale)}`
		);
	doc.moveDown();

	doc.table({
		position: { x: mm(LEFT_MM) },
		maxWidth: mm(CONTENT_WIDTH_MM),
		columnStyles: [mm(22), mm(35), mm(30), mm(58), mm(20)],
		defaultStyle: { padding: 4, border: [0, 0, 0.5, 0], borderColor: '#cccccc' },
		data: [
			[
				{ text: labels.entryDate, font: { family: 'bold' } },
				{ text: labels.project, font: { family: 'bold' } },
				{ text: labels.task, font: { family: 'bold' } },
				{ text: labels.note, font: { family: 'bold' } },
				{ text: labels.totalMinutes, font: { family: 'bold' }, align: { x: 'right' } }
			],
			...report.entries.map((entry) => [
				formatDate(entry.date, report.locale),
				entry.projectName,
				entry.taskName ?? '',
				entry.note ?? '',
				{ text: `${entry.minutes} ${labels.minutes}`, align: { x: 'right' as const } }
			])
		]
	});

	doc.moveDown();
	doc.font(BOLD_FONT).fontSize(10);
	doc.text(`${labels.totalMinutes}: ${report.totals.minutes} ${labels.minutes}`);
	doc
		.font(REGULAR_FONT)
		.fontSize(9)
		.fillColor('#555555')
		.text(`${labels.totalBillableMinutes}: ${report.totals.billableMinutes} ${labels.minutes}`);

	doc.moveDown(2);
	doc
		.fontSize(7)
		.text(labels.generatedAt(formatDate(report.generatedAt.slice(0, 10), report.locale)));

	if (report.specimen) {
		const range = doc.bufferedPageRange();
		for (let i = 0; i < range.count; i++) {
			doc.switchToPage(range.start + i);
			drawWatermark(doc, labels.timeReportSpecimen, 0);
		}
	}

	return await finish(doc);
}

function finish(doc: PDFKit.PDFDocument): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		doc.on('data', (chunk: Buffer) => chunks.push(chunk));
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);
		doc.end();
	});
}
