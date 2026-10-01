import { Injectable } from '@nestjs/common';
import type { Invoice } from '@zeit/shared';
import { renderTimeReportCsv, type Download } from './time-report-csv';
import type { TimeReport } from './time-report';
import { renderInWorker } from './worker';

@Injectable()
export class DocumentsService {
	renderInvoicePdf(invoice: Invoice): Promise<Buffer> {
		return renderInWorker({ kind: 'invoice', invoice });
	}

	renderTimeReportPdf(report: TimeReport): Promise<Buffer> {
		return renderInWorker({ kind: 'time-report-pdf', report });
	}

	renderTimeReportCsv(report: TimeReport): Download {
		return renderTimeReportCsv(report);
	}
}
