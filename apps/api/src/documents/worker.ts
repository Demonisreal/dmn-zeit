import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import type { Invoice } from '@zeit/shared';
import { buildInvoicePdf } from './pdf';
import { withRenderSlot } from './render-limit';
import { buildTimeReportPdf } from './time-report-pdf';
import type { TimeReport } from './time-report';

const RENDER_TIMEOUT_MS = 5000;

export type RenderJob =
	| { kind: 'invoice'; invoice: Invoice }
	| { kind: 'time-report-pdf'; report: TimeReport };

// same file runs the pool on the main thread and the pdfkit work on the worker thread it spawns,
// so a single new Worker(__filename) always finds this module already compiled next to it
export async function renderInWorker(job: RenderJob): Promise<Buffer> {
	return withRenderSlot(() => runInThread(job));
}

function runInThread(job: RenderJob): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(__filename, {
			workerData: job,
			resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 }
		});
		const timer = setTimeout(() => {
			worker.terminate();
			reject(new Error('Rendering timed out after 5s'));
		}, RENDER_TIMEOUT_MS);

		worker.once('message', (buffer: Buffer) => {
			clearTimeout(timer);
			resolve(Buffer.from(buffer));
			void worker.terminate();
		});
		worker.once('error', (error) => {
			clearTimeout(timer);
			reject(error);
		});
		worker.once('exit', (code) => {
			clearTimeout(timer);
			if (code !== 0) reject(new Error(`Render worker exited with code ${code}`));
		});
	});
}

if (!isMainThread && parentPort) {
	const port = parentPort;
	const job = workerData as RenderJob;
	(job.kind === 'invoice' ? buildInvoicePdf(job.invoice) : buildTimeReportPdf(job.report))
		.then((buffer) => port.postMessage(buffer))
		.catch((error: unknown) => {
			// rethrowing surfaces the failure through the worker's 'error' event on the main thread
			throw error;
		});
}
