import { BadRequestException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DocumentsService,
	FAILURE_TTL_MS,
	MAX_FAILURES,
	MAX_REPORT_ENTRIES
} from './documents.service';
import { invoiceFixture } from './invoice.fixture';
import { PageLimitError, RenderBusyError, RenderFailedError } from './render-limit';
import { timeReportFixture } from './time-report.fixture';
import { renderInWorker, type RenderedDocument } from './worker';

vi.mock('./worker', () => ({ renderInWorker: vi.fn() }));

const render = vi.mocked(renderInWorker);
const rendered: RenderedDocument[] = [{ format: 'pdf', content: Buffer.from('%PDF-') }];
const timedOut = () => new Error('Rendering timed out after 5s');

beforeEach(() => {
	vi.useFakeTimers();
	render.mockReset();
});

afterEach(() => vi.useRealTimers());

describe('DocumentsService.renderInvoice after a failed render', () => {
	it('answers from memory until 30 s are up and only then renders again', async () => {
		const documents = new DocumentsService();
		const invoice = invoiceFixture();
		render.mockRejectedValueOnce(timedOut());
		await expect(documents.renderInvoice(invoice)).rejects.toThrow('timed out');

		vi.advanceTimersByTime(10_000);
		const refused = await documents.renderInvoice(invoice).catch((error: unknown) => error);
		expect(refused).toBeInstanceOf(RenderFailedError);
		expect((refused as RenderFailedError).retryAfter).toBe(20);
		expect(render).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(FAILURE_TTL_MS - 10_000);
		render.mockResolvedValueOnce(rendered);
		await expect(documents.renderInvoice(invoice)).resolves.toBe(rendered);
		expect(render).toHaveBeenCalledTimes(2);
	});

	it('keeps answering a document past the page limit with the page limit', async () => {
		const documents = new DocumentsService();
		const invoice = invoiceFixture();
		render.mockRejectedValueOnce(new PageLimitError());
		await expect(documents.renderInvoice(invoice)).rejects.toBeInstanceOf(PageLimitError);
		await expect(documents.renderInvoice(invoice)).rejects.toBeInstanceOf(PageLimitError);
		expect(render).toHaveBeenCalledTimes(1);
	});

	it('remembers the failure per invoice and format', async () => {
		const documents = new DocumentsService();
		render.mockRejectedValueOnce(timedOut()).mockResolvedValue(rendered);
		await expect(documents.renderInvoice(invoiceFixture())).rejects.toThrow('timed out');

		await expect(documents.renderInvoice(invoiceFixture({ format: 'zugferd' }))).resolves.toBe(
			rendered
		);
		await expect(documents.renderInvoice(invoiceFixture({ id: 'another' }))).resolves.toBe(
			rendered
		);
		expect(render).toHaveBeenCalledTimes(3);
	});

	it('does not hold a full render queue against the document', async () => {
		const documents = new DocumentsService();
		render.mockRejectedValueOnce(new RenderBusyError()).mockResolvedValue(rendered);
		await expect(documents.renderInvoice(invoiceFixture())).rejects.toBeInstanceOf(RenderBusyError);
		await expect(documents.renderInvoice(invoiceFixture())).resolves.toBe(rendered);
	});

	it('drops the oldest failure once it holds as many as it may', async () => {
		const documents = new DocumentsService();
		render.mockRejectedValue(timedOut());
		for (let i = 0; i <= MAX_FAILURES; i++) {
			await documents.renderInvoice(invoiceFixture({ id: `invoice-${i}` })).catch(() => undefined);
		}
		expect(render).toHaveBeenCalledTimes(MAX_FAILURES + 1);

		await expect(
			documents.renderInvoice(invoiceFixture({ id: 'invoice-1' }))
		).rejects.toBeInstanceOf(RenderFailedError);
		await expect(documents.renderInvoice(invoiceFixture({ id: 'invoice-0' }))).rejects.toThrow(
			'timed out'
		);
		expect(render).toHaveBeenCalledTimes(MAX_FAILURES + 2);
	});
});

describe('DocumentsService time report', () => {
	const entries = (count: number) =>
		Array.from({ length: count }, () => timeReportFixture().entries[0]!);

	it(`refuses a pdf with more than ${MAX_REPORT_ENTRIES} bookings before it reaches the worker`, async () => {
		const documents = new DocumentsService();
		const refused = await documents
			.renderTimeReportPdf(timeReportFixture({ entries: entries(MAX_REPORT_ENTRIES + 1) }))
			.catch((error: unknown) => error);
		expect(refused).toBeInstanceOf(BadRequestException);
		expect((refused as BadRequestException).getResponse()).toMatchObject({
			code: 'VALIDATION',
			details: [
				{ field: 'entries', message: 'report.tooManyEntries', params: { max: MAX_REPORT_ENTRIES } }
			]
		});
		expect(render).not.toHaveBeenCalled();

		render.mockResolvedValueOnce(rendered);
		await documents.renderTimeReportPdf(
			timeReportFixture({ entries: entries(MAX_REPORT_ENTRIES) })
		);
		expect(render).toHaveBeenCalledOnce();
	});

	it('writes any number of bookings as csv, nothing is rendered there', () => {
		const { body } = new DocumentsService().renderTimeReportCsv(
			timeReportFixture({ entries: entries(MAX_REPORT_ENTRIES + 1) })
		);
		expect(body.trim().split('\n').length).toBeGreaterThan(MAX_REPORT_ENTRIES + 1);
		expect(render).not.toHaveBeenCalled();
	});
});
