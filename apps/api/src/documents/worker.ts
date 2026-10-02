import { isMainThread, parentPort, Worker, workerData, type ResourceLimits } from 'node:worker_threads';
import type { Invoice, InvoiceFormat } from '@zeit/shared';
import { toEInvoice } from '../einvoice/from-invoice';
import { buildInvoicePdf } from './pdf';
import { PageLimitError, withRenderSlot } from './render-limit';
import { buildTimeReportPdf } from './time-report-pdf';
import type { TimeReport } from './time-report';

const RENDER_TIMEOUT_MS = 5000;

export type RenderJob =
	| { kind: 'invoice'; invoice: Invoice; format: InvoiceFormat }
	| { kind: 'time-report-pdf'; report: TimeReport };

export type DocumentFormat = 'pdf' | 'zugferd' | 'xrechnung_cii' | 'time_report_pdf';
export type RenderedDocument = { format: DocumentFormat; content: Buffer };

export async function renderJob(job: RenderJob): Promise<RenderedDocument[]> {
	if (job.kind === 'time-report-pdf') {
		return [{ format: 'time_report_pdf', content: await buildTimeReportPdf(job.report) }];
	}
	const pdf = await buildInvoicePdf(job.invoice);
	if (job.format === 'pdf') {
		return [{ format: 'pdf', content: pdf }];
	}
	const { renderXRechnung, renderZugferd } = await import('../einvoice/einvoice.js');
	const einvoice = toEInvoice(job.invoice);
	if (job.format === 'zugferd') {
		return [{ format: 'zugferd', content: Buffer.from(await renderZugferd(einvoice, pdf)) }];
	}
	return [
		{ format: 'xrechnung_cii', content: Buffer.from(await renderXRechnung(einvoice), 'utf8') },
		{ format: 'pdf', content: pdf }
	];
}

export async function renderInWorker(job: RenderJob): Promise<RenderedDocument[]> {
	return withRenderSlot(() => runInThread(job));
}

type ThreadOptions = { filename?: string; timeoutMs?: number; resourceLimits?: ResourceLimits };

export function runInThread(
	job: RenderJob,
	{
		filename = __filename,
		timeoutMs = RENDER_TIMEOUT_MS,
		resourceLimits = { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 }
	}: ThreadOptions = {}
): Promise<RenderedDocument[]> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(filename, { workerData: job, resourceLimits });
		const timer = setTimeout(() => {
			void worker.terminate();
			reject(new Error(`Rendering timed out after ${timeoutMs / 1000}s`));
		}, timeoutMs);

		worker.once('message', (documents: RenderedDocument[]) => {
			clearTimeout(timer);
			resolve(documents.map(({ format, content }) => ({ format, content: Buffer.from(content) })));
			void worker.terminate();
		});
		worker.once('error', (error) => {
			clearTimeout(timer);
			reject(error.name === 'PageLimitError' ? new PageLimitError() : error);
		});
		worker.once('exit', (code) => {
			clearTimeout(timer);
			if (code !== 0) reject(new Error(`Render worker exited with code ${code}`));
		});
	});
}

if (!isMainThread && parentPort) {
	const port = parentPort;
	void renderJob(workerData as RenderJob).then((documents) => port.postMessage(documents));
}
