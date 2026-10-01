import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import {
	cancelInvoiceSchema,
	createDraftSchema,
	invoiceLineInputSchema,
	invoiceListQuerySchema,
	invoiceTimeReportQuerySchema,
	issueInvoiceSchema,
	markPaidSchema,
	updateDraftSchema,
	uuidSchema
} from '@zeit/shared';
import type {
	CancelInvoiceInput,
	CreateDraftInput,
	Invoice,
	InvoiceLine,
	InvoiceLineInput,
	InvoiceListQuery,
	InvoicePage,
	InvoiceTimeReportQuery,
	IssueInvoiceInput,
	MarkPaidInput,
	UpdateDraftInput
} from '@zeit/shared';
import type { Response } from 'express';
import { CurrentClient, type Client } from '../common/client.decorator';
import { CurrentSession } from '../common/current-session.decorator';
import { RequireReauth } from '../common/reauth.guard';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { ZodPipe } from '../common/zod.pipe';
import { RenderLimitGuard } from '../documents/render-limit.guard';
import type { LinePatch } from './invoices.service';
import { InvoicesService } from './invoices.service';
import { UserRateLimit, UserRateLimitGuard } from './user-rate-limit.guard';

const id = new ZodPipe(uuidSchema);
const updateLineSchema = invoiceLineInputSchema.partial();

@Controller('invoices')
@Roles('hr')
@UseGuards(UserRateLimitGuard)
export class InvoicesController {
	constructor(private readonly invoices: InvoicesService) {}

	@Get()
	list(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(invoiceListQuerySchema)) query: InvoiceListQuery
	): Promise<InvoicePage> {
		return this.invoices.list(session, query);
	}

	@Post('drafts')
	@HttpCode(201)
	@UserRateLimit('drafts', 30)
	createDraft(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(createDraftSchema)) body: CreateDraftInput,
		@CurrentClient() client: Client
	): Promise<Invoice> {
		return this.invoices.createDraft(session, body, client);
	}

	@Get(':id')
	get(@CurrentSession() session: AuthSession, @Param('id', id) invoiceId: string): Promise<Invoice> {
		return this.invoices.get(session, invoiceId);
	}

	@Patch(':id')
	update(
		@CurrentSession() session: AuthSession,
		@Param('id', id) invoiceId: string,
		@Body(new ZodPipe(updateDraftSchema)) body: UpdateDraftInput
	): Promise<Invoice> {
		return this.invoices.updateDraft(session, invoiceId, body);
	}

	@Delete(':id')
	@HttpCode(204)
	async remove(@CurrentSession() session: AuthSession, @Param('id', id) invoiceId: string) {
		await this.invoices.deleteDraft(session, invoiceId);
	}

	@Post(':id/refresh')
	@HttpCode(200)
	refresh(@CurrentSession() session: AuthSession, @Param('id', id) invoiceId: string): Promise<Invoice> {
		return this.invoices.refresh(session, invoiceId);
	}

	@Post(':id/lines')
	@HttpCode(201)
	addLine(
		@CurrentSession() session: AuthSession,
		@Param('id', id) invoiceId: string,
		@Body(new ZodPipe(invoiceLineInputSchema)) body: InvoiceLineInput
	): Promise<InvoiceLine> {
		return this.invoices.addLine(session, invoiceId, body);
	}

	@Patch(':id/lines/:lineId')
	updateLine(
		@CurrentSession() session: AuthSession,
		@Param('id', id) invoiceId: string,
		@Param('lineId', id) lineId: string,
		@Body(new ZodPipe(updateLineSchema)) body: LinePatch
	): Promise<InvoiceLine> {
		return this.invoices.updateLine(session, invoiceId, lineId, body);
	}

	@Delete(':id/lines/:lineId')
	@HttpCode(204)
	async removeLine(
		@CurrentSession() session: AuthSession,
		@Param('id', id) invoiceId: string,
		@Param('lineId', id) lineId: string
	) {
		await this.invoices.deleteLine(session, invoiceId, lineId);
	}

	// D-03: a draft is never mistaken for a real invoice, frame-ancestors 'self' only for this route
	@Get(':id/preview.pdf')
	@UseGuards(RenderLimitGuard)
	@UserRateLimit('preview', 20)
	async previewPdf(
		@CurrentSession() session: AuthSession,
		@Param('id', id) invoiceId: string,
		@Res({ passthrough: true }) response: Response
	): Promise<Buffer> {
		const pdf = await this.invoices.previewPdf(session, invoiceId);
		response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'");
		response.setHeader('X-Frame-Options', 'SAMEORIGIN');
		response.setHeader('Content-Type', 'application/pdf');
		response.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
		response.setHeader('Cache-Control', 'no-store');
		return pdf;
	}

	@Post(':id/issue')
	@HttpCode(200)
	@RequireReauth()
	@UseGuards(RenderLimitGuard)
	@UserRateLimit('issue', 30, 60)
	issue(
		@CurrentSession() session: AuthSession,
		@Param('id', id) invoiceId: string,
		@Body(new ZodPipe(issueInvoiceSchema)) body: IssueInvoiceInput,
		@CurrentClient() client: Client
	): Promise<Invoice> {
		return this.invoices.issue(session, invoiceId, body.format, client);
	}

	@Post(':id/cancel')
	@HttpCode(200)
	@RequireReauth()
	@UseGuards(RenderLimitGuard)
	@UserRateLimit('cancel', 10, 60)
	cancel(
		@CurrentSession() session: AuthSession,
		@Param('id', id) invoiceId: string,
		@Body(new ZodPipe(cancelInvoiceSchema)) body: CancelInvoiceInput,
		@CurrentClient() client: Client
	): Promise<Invoice> {
		return this.invoices.cancel(session, invoiceId, body, client);
	}

	@Post(':id/paid')
	@HttpCode(200)
	@UserRateLimit('payments', 30)
	markPaid(
		@CurrentSession() session: AuthSession,
		@Param('id', id) invoiceId: string,
		@Body(new ZodPipe(markPaidSchema)) body: MarkPaidInput,
		@CurrentClient() client: Client
	): Promise<Invoice> {
		return this.invoices.markPaid(session, invoiceId, body, client);
	}

	@Post(':id/unpaid')
	@HttpCode(200)
	@UserRateLimit('payments', 30)
	markUnpaid(
		@CurrentSession() session: AuthSession,
		@Param('id', id) invoiceId: string,
		@CurrentClient() client: Client
	): Promise<Invoice> {
		return this.invoices.markUnpaid(session, invoiceId, client);
	}

	// usually served from storage (R-06); the rare on-demand re-render still hits the render queue,
	// but the guard would also reject the common case, so RenderBusyError falls through to the filter
	@Get(':id/document')
	async document(
		@CurrentSession() session: AuthSession,
		@Param('id', id) invoiceId: string,
		@Res({ passthrough: true }) response: Response
	): Promise<Buffer> {
		const document = await this.invoices.document(session, invoiceId);
		response.setHeader('Content-Type', 'application/pdf');
		response.setHeader('Content-Disposition', `attachment; filename="${document.filename}"`);
		response.setHeader('Cache-Control', 'no-store');
		response.setHeader('ETag', `"${document.sha256.toString('hex')}"`);
		return document.content;
	}

	@Get(':id/time-report')
	@UseGuards(RenderLimitGuard)
	@UserRateLimit('time-report', 20)
	async timeReport(
		@CurrentSession() session: AuthSession,
		@Param('id', id) invoiceId: string,
		@Query(new ZodPipe(invoiceTimeReportQuerySchema)) query: InvoiceTimeReportQuery,
		@Res({ passthrough: true }) response: Response
	): Promise<Buffer | string> {
		const report = await this.invoices.timeReport(session, invoiceId, query.format);
		response.setHeader('Cache-Control', 'no-store');
		if (Buffer.isBuffer(report)) {
			response.setHeader('Content-Type', 'application/pdf');
			response.setHeader('Content-Disposition', 'attachment; filename="time-report.pdf"');
			return report;
		}
		response.setHeader('Content-Type', 'text/csv; charset=utf-8');
		response.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
		return report.body;
	}
}
