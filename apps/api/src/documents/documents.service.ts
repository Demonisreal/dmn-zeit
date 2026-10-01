import { BadRequestException, Injectable } from '@nestjs/common';
import type { ApiError, Invoice } from '@zeit/shared';
import { PageLimitError, RenderBusyError, RenderFailedError } from './render-limit';
import { renderTimeReportCsv, type Download } from './time-report-csv';
import type { TimeReport } from './time-report';
import { renderInWorker, type RenderedDocument } from './worker';

export const MAX_REPORT_ENTRIES = 1800;
export const FAILURE_TTL_MS = 30_000;
export const MAX_FAILURES = 1000;

function tooManyEntries() {
	return new BadRequestException({
		code: 'VALIDATION',
		message: 'Invalid input',
		details: [
			{
				field: 'entries',
				code: 'custom',
				message: 'report.tooManyEntries',
				params: { max: MAX_REPORT_ENTRIES }
			}
		]
	} satisfies ApiError);
}

@Injectable()
export class DocumentsService {
	private readonly failures = new Map<string, { until: number; error: unknown }>();

	async renderInvoicePdf(invoice: Invoice): Promise<Buffer> {
		const [pdf] = await renderInWorker({ kind: 'invoice', invoice, format: 'pdf' });
		return pdf!.content;
	}

	async renderInvoice(invoice: Invoice): Promise<RenderedDocument[]> {
		const key = `${invoice.id}:${invoice.format}`;
		const failed = this.failures.get(key);
		if (failed && failed.until > Date.now()) {
			if (failed.error instanceof PageLimitError) throw failed.error;
			throw new RenderFailedError(Math.ceil((failed.until - Date.now()) / 1000));
		}
		this.failures.delete(key);

		try {
			return await renderInWorker({ kind: 'invoice', invoice, format: invoice.format });
		} catch (error) {
			if (!(error instanceof RenderBusyError)) this.remember(key, error);
			throw error;
		}
	}

	async renderTimeReportPdf(report: TimeReport): Promise<Buffer> {
		if (report.entries.length > MAX_REPORT_ENTRIES) throw tooManyEntries();
		const [pdf] = await renderInWorker({ kind: 'time-report-pdf', report });
		return pdf!.content;
	}

	renderTimeReportCsv(report: TimeReport): Download {
		return renderTimeReportCsv(report);
	}

	private remember(key: string, error: unknown) {
		if (this.failures.size >= MAX_FAILURES) {
			const [oldest] = this.failures.keys();
			this.failures.delete(oldest!);
		}
		this.failures.set(key, { until: Date.now() + FAILURE_TTL_MS, error });
	}
}
