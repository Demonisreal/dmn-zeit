import { isSmallAmountInvoice } from '@zeit/rules';
import type { Invoice, InvoiceLine, Locale, TaxGroup } from '@zeit/shared';
import PDFDocument from 'pdfkit';
import { isLeitwegId } from '../einvoice/mapping';
import { TEXTS } from '../einvoice/texts';
import { rateText, roundingText } from './explain';
import { formatCents, formatCountry, formatDate, formatHours, formatTaxRate } from './format';
import { BOLD_FONT, REGULAR_FONT } from './fonts';
import { LABELS, labelsFor } from './labels';
import { MAX_PAGES, PageLimitError } from './render-limit';

const MM = 72 / 25.4;
const mm = (value: number) => value * MM;

const PAGE_WIDTH_MM = 210;
const LEFT_MM = 25;
const RIGHT_MM = 20;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - LEFT_MM - RIGHT_MM;

const RETURN_ADDRESS_TOP_MM = 45;
const ADDRESS_TOP_MM = 50;
const ADDRESS_HEIGHT_MM = 45;
const ADDRESS_WIDTH_MM = 85;

const INFO_BLOCK_LEFT_MM = 125;
const INFO_BLOCK_TOP_MM = ADDRESS_TOP_MM;
const INFO_BLOCK_WIDTH_MM = PAGE_WIDTH_MM - RIGHT_MM - INFO_BLOCK_LEFT_MM;

const BODY_TOP_MM = 100;
const FOLLOW_PAGE_TOP_MM = 25;

const FOLD_MARK_1_MM = 105;
const FOLD_MARK_2_MM = 210;
const PUNCH_MARK_MM = 148.5;

const PAGE_HEIGHT_MM = 297;
const BOTTOM_MM = 20;
const FOOTER_HEIGHT_MM = 22;
const FOOTER_TOP_MM = PAGE_HEIGHT_MM - BOTTOM_MM - FOOTER_HEIGHT_MM;

const TOTALS_LABEL_MM = LEFT_MM + 70;
const TOTALS_VALUE_MM = LEFT_MM + 135;

function drawCropMarks(doc: PDFKit.PDFDocument): void {
	doc.save().lineWidth(0.3).strokeColor('#000000');
	for (const y of [FOLD_MARK_1_MM, FOLD_MARK_2_MM]) {
		doc.moveTo(0, mm(y)).lineTo(mm(5), mm(y)).stroke();
	}
	doc.moveTo(0, mm(PUNCH_MARK_MM)).lineTo(mm(2.5), mm(PUNCH_MARK_MM)).stroke();
	doc.restore();
}

export function drawWatermark(
	doc: PDFKit.PDFDocument,
	text: string,
	offsetMm: number,
	size = 20
): void {
	doc.save();
	doc.rotate(-45, { origin: [mm(PAGE_WIDTH_MM) / 2, mm(PAGE_HEIGHT_MM) / 2] });
	doc
		.font(BOLD_FONT)
		.fontSize(size)
		.fillColor('#b91c1c', 0.3)
		.text(text, -mm(80), mm(PAGE_HEIGHT_MM) / 2 + mm(offsetMm) - 10, {
			width: mm(PAGE_WIDTH_MM) + mm(160),
			height: mm(20),
			lineBreak: false,
			align: 'center'
		});
	doc.restore();
}

function drawSpecimenWatermark(doc: PDFKit.PDFDocument, locale: Locale, offsetMm: number): void {
	if (locale === 'de') {
		drawWatermark(doc, LABELS.de.specimenWatermark, offsetMm);
		return;
	}
	drawWatermark(doc, LABELS.de.specimenWatermark, offsetMm - 4.5);
	drawWatermark(doc, LABELS[locale].specimenWatermark, offsetMm + 4.5, 18);
}

function drawWatermarks(
	doc: PDFKit.PDFDocument,
	invoice: Invoice,
	labels: ReturnType<typeof labelsFor>
): void {
	if (invoice.status === 'draft' && invoice.specimen) {
		drawWatermark(doc, labels.draftWatermark, -18);
		drawSpecimenWatermark(doc, invoice.locale, 18);
	} else if (invoice.status === 'draft') {
		drawWatermark(doc, labels.draftWatermark, 0);
	} else if (invoice.specimen) {
		drawSpecimenWatermark(doc, invoice.locale, 0);
	}
}

function returnAddressLine(invoice: Invoice): string {
	const { seller } = invoice;
	return [
		seller.legalName,
		seller.street,
		[seller.postalCode, seller.city].filter(Boolean).join(' ')
	]
		.filter(Boolean)
		.join(' · ');
}

function drawAddressField(doc: PDFKit.PDFDocument, invoice: Invoice): void {
	doc.font(REGULAR_FONT).fontSize(7).fillColor('#000000');
	doc.text(returnAddressLine(invoice), mm(LEFT_MM), mm(RETURN_ADDRESS_TOP_MM), {
		width: mm(ADDRESS_WIDTH_MM),
		height: doc.currentLineHeight(true),
		ellipsis: true
	});

	const { buyer } = invoice;
	const lines = [
		buyer.name,
		buyer.street,
		[buyer.postalCode, buyer.city].filter(Boolean).join(' '),
		buyer.countryCode !== 'DE' ? formatCountry(buyer.countryCode, invoice.locale) : null
	].filter((line): line is string => Boolean(line));

	doc
		.font(REGULAR_FONT)
		.fontSize(10)
		.text(lines.join('\n'), mm(LEFT_MM), mm(ADDRESS_TOP_MM) + 18, {
			width: mm(ADDRESS_WIDTH_MM),
			height: mm(ADDRESS_HEIGHT_MM) - 18
		});
}

function drawInfoBlock(
	doc: PDFKit.PDFDocument,
	invoice: Invoice,
	labels: ReturnType<typeof labelsFor>
): void {
	const { buyer } = invoice;
	const rows: [string, string][] = [];
	if (invoice.number) rows.push([labels.invoiceNumber, invoice.number]);
	if (invoice.issueDate) rows.push([labels.date, formatDate(invoice.issueDate, invoice.locale)]);
	if (buyer.number) rows.push([labels.customerNumber, buyer.number]);
	if (buyer.buyerReference) {
		rows.push([
			isLeitwegId(buyer) ? labels.leitwegId : labels.buyerReference,
			buyer.buyerReference
		]);
	}
	if (buyer.vatId) rows.push([labels.buyerVatId, buyer.vatId]);
	rows.push([
		labels.servicePeriod,
		`${formatDate(invoice.serviceFrom, invoice.locale)} – ${formatDate(invoice.serviceTo, invoice.locale)}`
	]);

	let y = mm(INFO_BLOCK_TOP_MM);
	for (const [label, value] of rows) {
		doc
			.font(REGULAR_FONT)
			.fontSize(8)
			.fillColor('#555555')
			.text(label, mm(INFO_BLOCK_LEFT_MM), y, { width: mm(INFO_BLOCK_WIDTH_MM) });
		doc
			.font(BOLD_FONT)
			.fontSize(9)
			.fillColor('#000000')
			.text(value, mm(INFO_BLOCK_LEFT_MM), y + 10, { width: mm(INFO_BLOCK_WIDTH_MM) });
		y += 24;
	}
}

function titleFor(invoice: Invoice, labels: ReturnType<typeof labelsFor>): string {
	if (invoice.kind === 'cancellation') return labels.cancellation;
	return labels.invoice;
}

function drawTitle(
	doc: PDFKit.PDFDocument,
	invoice: Invoice,
	labels: ReturnType<typeof labelsFor>
): void {
	doc.y = mm(BODY_TOP_MM);
	doc.x = mm(LEFT_MM);
	doc
		.font(BOLD_FONT)
		.fontSize(16)
		.fillColor('#000000')
		.text(titleFor(invoice, labels), { width: mm(CONTENT_WIDTH_MM) });
	const { refersTo } = invoice;
	if (invoice.kind === 'cancellation' && refersTo?.number && refersTo.issueDate) {
		const issued = formatDate(refersTo.issueDate, invoice.locale);
		doc
			.font(REGULAR_FONT)
			.fontSize(10)
			.text(TEXTS[invoice.locale].cancels(refersTo.number, issued), {
				width: mm(CONTENT_WIDTH_MM)
			});
	}
	if (isSmallAmount(invoice)) {
		doc.font(REGULAR_FONT).fontSize(9).fillColor('#555555').text(labels.smallAmountInvoice);
	}
	doc.moveDown();
}

function drawIntro(doc: PDFKit.PDFDocument, invoice: Invoice): void {
	if (!invoice.introText) return;
	doc
		.font(REGULAR_FONT)
		.fontSize(10)
		.fillColor('#000000')
		.text(invoice.introText, { width: mm(CONTENT_WIDTH_MM) });
	doc.moveDown();
}

function isSmallAmount(invoice: Invoice): boolean {
	return isSmallAmountInvoice(BigInt(invoice.totals.grossCents), invoice.treatment);
}

function quantityText(line: InvoiceLine, locale: Locale): string {
	const labels = labelsFor(locale);
	if (line.kind === 'time') {
		return `${formatHours(line.minutes ?? 0)} ${labels.hours}`;
	}
	const quantity = Number(BigInt(line.quantityMilli ?? '0')) / 1000;
	const unit = line.unit ? labels.unit(line.unit, Math.abs(quantity)) : '';
	return `${quantity.toLocaleString(locale === 'de' ? 'de-DE' : 'en-US')} ${unit}`.trim();
}

function unitPriceText(line: InvoiceLine, locale: Locale): string {
	if (!line.unitPriceCents) return '';
	const price = formatCents(line.unitPriceCents, locale);
	return line.kind === 'time' ? `${price}/${labelsFor(locale).hours}` : price;
}

function derivationText(line: InvoiceLine, locale: Locale): string | null {
	const parts = [
		line.derivation.rounding ? roundingText(line.derivation.rounding, locale) : null,
		line.derivation.rate ? rateText(line.derivation.rate.explanation, locale) : null
	].filter((part): part is string => Boolean(part));
	return parts.length > 0 ? parts.join(' · ') : null;
}

function descriptionCell(line: InvoiceLine, locale: Locale): string {
	const derivation = derivationText(line, locale);
	return derivation ? `${line.description}\n${derivation}` : line.description;
}

function drawPositionsTable(
	doc: PDFKit.PDFDocument,
	invoice: Invoice,
	labels: ReturnType<typeof labelsFor>
): void {
	const locale = invoice.locale;
	const withTax = invoice.taxProfile !== 'small_business';
	const head = (text: string, x: 'left' | 'right' = 'left') => ({
		text,
		font: { family: 'bold' },
		align: { x }
	});
	const right = (text: string) => ({ text, align: { x: 'right' as const } });

	doc.font(REGULAR_FONT).fontSize(9).fillColor('#000000');
	doc.table({
		position: { x: mm(LEFT_MM) },
		maxWidth: mm(CONTENT_WIDTH_MM),
		columnStyles: withTax
			? [mm(55), mm(25), mm(25), mm(25), mm(35)]
			: [mm(80), mm(25), mm(25), mm(35)],
		defaultStyle: { padding: 4, border: [0, 0, 0.5, 0], borderColor: '#cccccc' },
		data: [
			[
				head(labels.description),
				head(labels.quantity),
				head(labels.unitPrice),
				...(withTax ? [head(labels.taxRate)] : []),
				head(withTax ? labels.net : labels.amount, 'right')
			],
			...invoice.lines.map((line) => [
				descriptionCell(line, locale),
				quantityText(line, locale),
				unitPriceText(line, locale),
				...(withTax ? [formatTaxRate(line.taxRateBp)] : []),
				right(formatCents(line.netCents, locale))
			])
		]
	});
}

type TotalsRow = [label: string, amount: string, bold: boolean];

function totalsRows(invoice: Invoice, labels: ReturnType<typeof labelsFor>): TotalsRow[] {
	const locale = invoice.locale;
	const gross = formatCents(invoice.totals.grossCents, locale);
	if (invoice.taxProfile === 'small_business') return [[labels.invoiceAmount, gross, true]];

	const rateOf = (group: TaxGroup) =>
		group.taxRateBp > 0
			? formatTaxRate(group.taxRateBp)
			: (labels.untaxed[group.taxCategory] ?? formatTaxRate(0));
	return [
		...invoice.taxGroups.map((group): TotalsRow => [
			`${labels.subtotalNet} ${rateOf(group)}`,
			formatCents(group.netCents, locale),
			false
		]),
		...invoice.taxGroups
			.filter((group) => group.taxRateBp > 0)
			.map((group): TotalsRow => [
				`${labels.tax} ${formatTaxRate(group.taxRateBp)}`,
				formatCents(group.taxCents, locale),
				false
			]),
		[labels.total, gross, true]
	];
}

function drawTotals(
	doc: PDFKit.PDFDocument,
	invoice: Invoice,
	labels: ReturnType<typeof labelsFor>
): void {
	const rows = totalsRows(invoice, labels);
	doc.font(REGULAR_FONT).fontSize(10).fillColor('#000000');
	const step = doc.currentLineHeight(true) + 3;
	if (doc.y + mm(4) + step * rows.length > doc.page.height - doc.page.margins.bottom) {
		doc.addPage();
	}

	let y = doc.y + mm(4);
	for (const [label, amount, bold] of rows) {
		if (bold) y += 3;
		doc.font(bold ? BOLD_FONT : REGULAR_FONT);
		doc.text(`${label} `, mm(TOTALS_LABEL_MM), y, { width: mm(TOTALS_VALUE_MM - TOTALS_LABEL_MM) });
		doc.text(amount, mm(TOTALS_VALUE_MM), y, { width: mm(30), align: 'right' });
		y += step;
	}
	doc.x = mm(LEFT_MM);
	doc.y = y;
	doc.moveDown();
}

function drawLegalNotes(doc: PDFKit.PDFDocument, invoice: Invoice): void {
	if (invoice.legalNotes.length === 0) return;
	doc.x = mm(LEFT_MM);
	doc.font(REGULAR_FONT).fontSize(9).fillColor('#000000');
	for (const note of invoice.legalNotes) {
		doc.text(note, { width: mm(CONTENT_WIDTH_MM) });
	}
	doc.moveDown();
}

function drawClosing(doc: PDFKit.PDFDocument, invoice: Invoice): void {
	if (!invoice.closingText) return;
	doc.x = mm(LEFT_MM);
	doc
		.font(REGULAR_FONT)
		.fontSize(10)
		.fillColor('#000000')
		.text(invoice.closingText, { width: mm(CONTENT_WIDTH_MM) });
}

function drawFooter(
	doc: PDFKit.PDFDocument,
	invoice: Invoice,
	labels: ReturnType<typeof labelsFor>
): void {
	const { seller } = invoice;
	const y = mm(FOOTER_TOP_MM);
	const payable = invoice.kind === 'invoice';
	doc.font(REGULAR_FONT).fontSize(7).fillColor('#555555');

	const left = [
		seller.legalName,
		seller.street,
		[seller.postalCode, seller.city].filter(Boolean).join(' '),
		seller.taxNumber ? `${labels.taxNumber}: ${seller.taxNumber}` : null,
		seller.vatId && invoice.treatment !== 'outside_scope'
			? `${labels.vatId}: ${seller.vatId}`
			: null,
		seller.registerCourt && seller.registerNumber
			? labels.registerEntry(seller.registerCourt, seller.registerNumber)
			: null
	].filter(Boolean);

	const middle =
		payable && invoice.dueDate
			? [
					labels.paymentTerms(invoice.paymentTermsDays),
					labels.dueDate(formatDate(invoice.dueDate, invoice.locale))
				]
			: [];

	const right =
		payable && seller.iban
			? [
					labels.bankDetails,
					seller.bankName,
					`${labels.iban} ${seller.iban}`,
					seller.bic ? `${labels.bic} ${seller.bic}` : null
				].filter(Boolean)
			: [];

	const footerHeight = mm(FOOTER_HEIGHT_MM);
	doc.text(left.join('\n'), mm(LEFT_MM), y, { width: mm(50), height: footerHeight, lineGap: 1 });
	doc.text(middle.join('\n'), mm(LEFT_MM) + mm(58), y, {
		width: mm(50),
		height: footerHeight,
		lineGap: 1
	});
	doc.text(right.join('\n'), mm(LEFT_MM) + mm(115), y, {
		width: mm(50),
		height: footerHeight,
		lineGap: 1
	});
}

function decoratePages(
	doc: PDFKit.PDFDocument,
	invoice: Invoice,
	labels: ReturnType<typeof labelsFor>
): void {
	const range = doc.bufferedPageRange();
	for (let i = 0; i < range.count; i++) {
		doc.switchToPage(range.start + i);
		drawFooter(doc, invoice, labels);
		drawWatermarks(doc, invoice, labels);
		doc
			.font(REGULAR_FONT)
			.fontSize(7)
			.fillColor('#777777')
			.text(labels.page(i + 1, range.count), mm(LEFT_MM), mm(PAGE_HEIGHT_MM) - mm(10), {
				width: mm(CONTENT_WIDTH_MM),
				height: mm(8),
				lineBreak: false,
				align: 'right'
			});
	}
}

const XML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&apos;'
};
const xmlText = (text: string) => text.replace(/[&<>"']/g, (char) => XML_ESCAPES[char]!);

export function escapeXmp(doc: PDFKit.PDFDocument): void {
	const { Title, Author } = doc.info;
	const writeXmp = doc.endMetadata.bind(doc);
	doc.endMetadata = () => {
		if (Title) doc.info.Title = xmlText(Title);
		if (Author) doc.info.Author = xmlText(Author);
		writeXmp();
	};
}

export function limitPages(doc: PDFKit.PDFDocument): void {
	doc.on('pageAdded', () => {
		if (doc.bufferedPageRange().count > MAX_PAGES) throw new PageLimitError();
	});
}

function applyMetadata(
	doc: PDFKit.PDFDocument,
	invoice: Invoice,
	labels: ReturnType<typeof labelsFor>
): void {
	const number = invoice.number ?? '—';
	doc.info.Title = invoice.specimen
		? `${labels.specimenWatermark.split('–')[0]!.trim()} ${number}`
		: `${titleFor(invoice, labels)} ${number}`;
	doc.info.Author = invoice.seller.legalName;
	doc.info.Creator = 'dmn-zeit';
	doc.info.CreationDate = invoice.issuedAt ? new Date(invoice.issuedAt) : new Date();
	escapeXmp(doc);
}

export async function buildInvoicePdf(invoice: Invoice): Promise<Buffer> {
	const labels = labelsFor(invoice.locale);
	const doc = new PDFDocument({
		size: 'A4',
		margins: {
			top: mm(FOLLOW_PAGE_TOP_MM),
			bottom: mm(BOTTOM_MM + FOOTER_HEIGHT_MM),
			left: mm(LEFT_MM),
			right: mm(RIGHT_MM)
		},
		bufferPages: true,
		pdfVersion: '1.7',
		tagged: true,
		lang: invoice.locale,
		subset: 'PDF/A-3b',
		autoFirstPage: false
	});
	applyMetadata(doc, invoice, labels);
	limitPages(doc);

	doc.addPage();
	drawCropMarks(doc);
	drawAddressField(doc, invoice);
	drawInfoBlock(doc, invoice, labels);
	drawTitle(doc, invoice, labels);
	drawIntro(doc, invoice);

	drawPositionsTable(doc, invoice, labels);
	drawTotals(doc, invoice, labels);
	drawLegalNotes(doc, invoice);
	drawClosing(doc, invoice);

	decoratePages(doc, invoice, labels);

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
