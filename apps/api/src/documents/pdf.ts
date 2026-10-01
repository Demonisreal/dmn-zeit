import type { Invoice, InvoiceLine, Locale, TaxGroup } from '@zeit/shared';
import PDFDocument from 'pdfkit';
import { rateText, roundingText } from './explain';
import { formatCents, formatDate, formatTaxRate } from './format';
import { boldFont, regularFont } from './fonts';
import { labelsFor } from './labels';

const MM = 72 / 25.4;
const mm = (value: number) => value * MM;

const PAGE_WIDTH_MM = 210;
const LEFT_MM = 25; // Fluchtlinie, DIN 5008/676 (Wikipedia "DIN 5008": Zeilen beginnen 2,5 cm vom linken Rand)
const RIGHT_MM = 20;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - LEFT_MM - RIGHT_MM;

// Form B (tiefgestelltes Anschriftfeld), Wikipedia "DIN 5008" und "DIN 676":
// Rücksendeangabe 45 mm, Anschriftfeld ab 50 mm, Feldhöhe 45 mm (Fassung 2020, vorher 40 mm)
const RETURN_ADDRESS_TOP_MM = 45;
const ADDRESS_TOP_MM = 50;
const ADDRESS_HEIGHT_MM = 45;
// Breite an einen C6/5-Fensterumschlag angelehnt, nicht gegen DIN 680 einzeln nachgewiesen
const ADDRESS_WIDTH_MM = 75;

const INFO_BLOCK_LEFT_MM = 125; // Spaltengrenze aus DIN 5008 (Wikipedia nennt sie für die Anlagenzeile)
const INFO_BLOCK_TOP_MM = ADDRESS_TOP_MM;
const INFO_BLOCK_WIDTH_MM = PAGE_WIDTH_MM - RIGHT_MM - INFO_BLOCK_LEFT_MM;

const BODY_TOP_MM = 100; // knapp unter dem Anschriftfeld, keine Normvorgabe für Rechnungen

// vom Auftrag vorgegeben: Falzmarken 105/210 mm, Lochmarke 148,5 mm (auch in "DIN 676" bestätigt)
const FOLD_MARK_1_MM = 105;
const FOLD_MARK_2_MM = 210;
const PUNCH_MARK_MM = 148.5;

const PAGE_HEIGHT_MM = 297;
const BOTTOM_MM = 20;
const FOOTER_HEIGHT_MM = 22;
const FOOTER_TOP_MM = PAGE_HEIGHT_MM - BOTTOM_MM - FOOTER_HEIGHT_MM;

function drawCropMarks(doc: PDFKit.PDFDocument): void {
	doc.save().lineWidth(0.3).strokeColor('#000000');
	for (const y of [FOLD_MARK_1_MM, FOLD_MARK_2_MM]) {
		doc.moveTo(0, mm(y)).lineTo(mm(5), mm(y)).stroke();
	}
	doc.moveTo(0, mm(PUNCH_MARK_MM)).lineTo(mm(2.5), mm(PUNCH_MARK_MM)).stroke();
	doc.restore();
}

function drawWatermark(doc: PDFKit.PDFDocument, text: string, offsetMm: number): void {
	doc.save();
	doc.rotate(-45, { origin: [mm(PAGE_WIDTH_MM) / 2, mm(PAGE_HEIGHT_MM) / 2] });
	doc
		.font('bold')
		.fontSize(20)
		.fillColor('#b91c1c', 0.3)
		.text(text, -mm(80), mm(PAGE_HEIGHT_MM) / 2 + mm(offsetMm) - 10, {
			width: mm(PAGE_WIDTH_MM) + mm(160),
			height: mm(20),
			lineBreak: false,
			align: 'center'
		});
	doc.restore();
}

// draft beats specimen in urgency, but a sandbox draft is both at once
function drawWatermarks(doc: PDFKit.PDFDocument, invoice: Invoice, labels: ReturnType<typeof labelsFor>): void {
	if (invoice.status === 'draft' && invoice.specimen) {
		drawWatermark(doc, labels.draftWatermark, -18);
		drawWatermark(doc, labels.specimenWatermark, 18);
	} else if (invoice.status === 'draft') {
		drawWatermark(doc, labels.draftWatermark, 0);
	} else if (invoice.specimen) {
		drawWatermark(doc, labels.specimenWatermark, 0);
	}
}

function returnAddressLine(invoice: Invoice): string {
	const { seller } = invoice;
	return [seller.legalName, seller.street, [seller.postalCode, seller.city].filter(Boolean).join(' ')]
		.filter(Boolean)
		.join(' · ');
}

function drawAddressField(doc: PDFKit.PDFDocument, invoice: Invoice): void {
	doc
		.font('body')
		.fontSize(7)
		.fillColor('#000000')
		.text(returnAddressLine(invoice), mm(LEFT_MM), mm(RETURN_ADDRESS_TOP_MM), {
			width: mm(ADDRESS_WIDTH_MM),
			lineBreak: false
		});

	// the country code has to be the address field's last line for foreign post, nothing goes below it
	const { buyer } = invoice;
	const lines = [
		buyer.name,
		buyer.street,
		[buyer.postalCode, buyer.city].filter(Boolean).join(' '),
		buyer.countryCode !== 'DE' ? buyer.countryCode : null
	].filter((line): line is string => Boolean(line));

	doc
		.font('body')
		.fontSize(10)
		.text(lines.join('\n'), mm(LEFT_MM), mm(ADDRESS_TOP_MM) + 18, {
			width: mm(ADDRESS_WIDTH_MM),
			height: mm(ADDRESS_HEIGHT_MM) - 18
		});
}

function drawInfoBlock(doc: PDFKit.PDFDocument, invoice: Invoice, labels: ReturnType<typeof labelsFor>): void {
	const rows: [string, string][] = [];
	if (invoice.number) rows.push([labels.invoiceNumber, invoice.number]);
	if (invoice.issueDate) rows.push([labels.date, formatDate(invoice.issueDate, invoice.locale)]);
	if (invoice.buyer.number) rows.push([labels.customerNumber, invoice.buyer.number]);
	// § 14a UStG: both parties' USt-IdNr. must appear on a reverse-charge invoice
	if (invoice.buyer.vatId) rows.push([labels.buyerVatId, invoice.buyer.vatId]);
	rows.push([
		labels.servicePeriod,
		`${formatDate(invoice.serviceFrom, invoice.locale)} – ${formatDate(invoice.serviceTo, invoice.locale)}`
	]);

	let y = mm(INFO_BLOCK_TOP_MM);
	for (const [label, value] of rows) {
		doc
			.font('body')
			.fontSize(8)
			.fillColor('#555555')
			.text(label, mm(INFO_BLOCK_LEFT_MM), y, { width: mm(INFO_BLOCK_WIDTH_MM) });
		doc
			.font('bold')
			.fontSize(9)
			.fillColor('#000000')
			.text(value, mm(INFO_BLOCK_LEFT_MM), y + 10, { width: mm(INFO_BLOCK_WIDTH_MM) });
		y += 26;
	}
}

function titleFor(invoice: Invoice, labels: ReturnType<typeof labelsFor>): string {
	if (invoice.kind === 'cancellation') return labels.cancellation;
	return labels.invoice;
}

function drawTitle(doc: PDFKit.PDFDocument, invoice: Invoice, labels: ReturnType<typeof labelsFor>): void {
	doc.y = mm(BODY_TOP_MM);
	doc.x = mm(LEFT_MM);
	doc.font('bold').fontSize(16).fillColor('#000000').text(titleFor(invoice, labels), { width: mm(CONTENT_WIDTH_MM) });
	if (invoice.kind === 'cancellation' && invoice.refersTo?.number) {
		doc
			.font('body')
			.fontSize(10)
			.text(labels.cancellationRefersTo(invoice.refersTo.number), { width: mm(CONTENT_WIDTH_MM) });
	}
	if (isSmallAmount(invoice)) {
		doc.font('body').fontSize(9).fillColor('#555555').text(labels.smallAmountInvoice);
	}
	doc.moveDown();
}

function drawIntro(doc: PDFKit.PDFDocument, invoice: Invoice): void {
	if (!invoice.introText) return;
	doc.font('body').fontSize(10).fillColor('#000000').text(invoice.introText, { width: mm(CONTENT_WIDTH_MM) });
	doc.moveDown();
}

// § 33 UStDV: bis 250 € brutto ohne Reverse Charge und ohne innergemeinschaftliche Lieferung
function isSmallAmount(invoice: Invoice): boolean {
	const excluded = invoice.lines.some(
		(line) => line.taxCategory === 'reverse_charge' || line.taxCategory === 'outside_scope'
	);
	return !excluded && BigInt(invoice.totals.grossCents) <= 25_000n;
}

function quantityText(line: InvoiceLine, locale: Locale): string {
	if (line.kind === 'time') {
		return `${line.minutes ?? 0} ${labelsFor(locale).minutes}`;
	}
	const quantity = Number(BigInt(line.quantityMilli ?? '0')) / 1000;
	return `${quantity.toLocaleString(locale === 'de' ? 'de-DE' : 'en-US')} ${line.unit ?? ''}`.trim();
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
	labels: ReturnType<typeof labelsFor>,
	reduced: boolean
): void {
	const locale = invoice.locale;
	if (reduced) {
		doc.table({
			position: { x: mm(LEFT_MM) },
			maxWidth: mm(CONTENT_WIDTH_MM),
			columnStyles: [mm(90), mm(30), mm(45)],
			defaultStyle: { padding: 4, border: [0, 0, 0.5, 0], borderColor: '#cccccc' },
			data: [
				[
					{ text: labels.description, font: { family: 'bold' } },
					{ text: labels.quantity, font: { family: 'bold' } },
					{ text: labels.total, font: { family: 'bold' } }
				],
				...invoice.lines.map((line) => [
					descriptionCell(line, locale),
					quantityText(line, locale),
					formatCents(line.netCents, locale)
				])
			]
		});
		return;
	}

	doc.table({
		position: { x: mm(LEFT_MM) },
		maxWidth: mm(CONTENT_WIDTH_MM),
		columnStyles: [mm(60), mm(25), mm(25), mm(20), mm(35)],
		defaultStyle: { padding: 4, border: [0, 0, 0.5, 0], borderColor: '#cccccc' },
		data: [
			[
				{ text: labels.description, font: { family: 'bold' } },
				{ text: labels.quantity, font: { family: 'bold' } },
				{ text: labels.unitPrice, font: { family: 'bold' } },
				{ text: labels.taxRate, font: { family: 'bold' } },
				{ text: labels.net, font: { family: 'bold' }, align: { x: 'right' } }
			],
			...invoice.lines.map((line) => [
				descriptionCell(line, locale),
				quantityText(line, locale),
				line.unitPriceCents ? formatCents(line.unitPriceCents, locale) : '',
				formatTaxRate(line.taxRateBp),
				{ text: formatCents(line.netCents, locale), align: { x: 'right' as const } }
			])
		]
	});
}

function drawTaxSummary(
	doc: PDFKit.PDFDocument,
	invoice: Invoice,
	labels: ReturnType<typeof labelsFor>
): void {
	doc.moveDown();
	const locale = invoice.locale;
	doc.x = mm(LEFT_MM);
	const line = (label: string, value: string, bold = false) => {
		doc
			.font(bold ? 'bold' : 'body')
			.fontSize(10)
			.text(label, mm(LEFT_MM + 90), doc.y, { width: mm(45), continued: true })
			.text(value, { width: mm(30), align: 'right' });
	};

	const taxable: TaxGroup[] = invoice.taxGroups.filter((group) => group.taxRateBp > 0);
	for (const group of taxable) {
		line(`${labels.subtotalNet} ${formatTaxRate(group.taxRateBp)}`, formatCents(group.netCents, locale));
	}
	if (taxable.length === 0) {
		line(labels.subtotalNet, formatCents(invoice.totals.netCents, locale));
	}
	for (const group of taxable) {
		line(`${labels.tax} ${formatTaxRate(group.taxRateBp)}`, formatCents(group.taxCents, locale));
	}
	doc.moveDown(0.3);
	line(labels.total, formatCents(invoice.totals.grossCents, locale), true);
	doc.moveDown();
}

function drawLegalNotes(doc: PDFKit.PDFDocument, invoice: Invoice): void {
	if (invoice.legalNotes.length === 0) return;
	doc.x = mm(LEFT_MM);
	doc.font('body').fontSize(8).fillColor('#333333');
	for (const note of invoice.legalNotes) {
		doc.text(note, { width: mm(CONTENT_WIDTH_MM) });
	}
	doc.moveDown();
}

function drawClosing(doc: PDFKit.PDFDocument, invoice: Invoice): void {
	if (!invoice.closingText) return;
	doc.x = mm(LEFT_MM);
	doc.font('body').fontSize(10).fillColor('#000000').text(invoice.closingText, { width: mm(CONTENT_WIDTH_MM) });
}

function drawFooter(doc: PDFKit.PDFDocument, invoice: Invoice, labels: ReturnType<typeof labelsFor>): void {
	const { seller } = invoice;
	const y = mm(FOOTER_TOP_MM);
	doc.font('body').fontSize(7).fillColor('#555555');

	const left = [
		seller.legalName,
		seller.street,
		[seller.postalCode, seller.city].filter(Boolean).join(' '),
		seller.taxNumber ? `${labels.taxNumber}: ${seller.taxNumber}` : null,
		seller.vatId ? `${labels.vatId}: ${seller.vatId}` : null,
		seller.registerCourt && seller.registerNumber
			? labels.registerEntry(seller.registerCourt, seller.registerNumber)
			: null
	].filter(Boolean);

	const middle =
		invoice.kind === 'invoice' && invoice.dueDate
			? [labels.paymentTerms(invoice.paymentTermsDays), labels.dueDate(formatDate(invoice.dueDate, invoice.locale))]
			: [];

	const right = seller.iban
		? [
				labels.bankDetails,
				seller.bankName,
				`${labels.iban} ${seller.iban}`,
				seller.bic ? `${labels.bic} ${seller.bic}` : null
			].filter(Boolean)
		: [];

	// an explicit height keeps this inside the reserved band instead of tripping pdfkit's own
	// overflow check, which would otherwise start a new page right here every time
	const footerHeight = mm(FOOTER_HEIGHT_MM);
	doc.text(left.join('\n'), mm(LEFT_MM), y, { width: mm(50), height: footerHeight, lineGap: 1 });
	doc.text(middle.join('\n'), mm(LEFT_MM) + mm(58), y, { width: mm(50), height: footerHeight, lineGap: 1 });
	doc.text(right.join('\n'), mm(LEFT_MM) + mm(115), y, { width: mm(50), height: footerHeight, lineGap: 1 });
}

// footer, watermark and page number go on every page, drawn last so the flowing content never
// has to know how many pages it ended up on
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
			.font('body')
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

function applyMetadata(doc: PDFKit.PDFDocument, invoice: Invoice, labels: ReturnType<typeof labelsFor>): void {
	// I-07: no email, no uuid, only the values the customer already sees on the page itself
	const number = invoice.number ?? '—';
	doc.info.Title = invoice.specimen ? `${labels.specimenWatermark.split('–')[0]!.trim()} ${number}` : `${titleFor(invoice, labels)} ${number}`;
	doc.info.Author = invoice.seller.legalName;
	doc.info.Creator = 'dmn-zeit';
	doc.info.CreationDate = invoice.issuedAt ? new Date(invoice.issuedAt) : new Date();
}

export async function buildInvoicePdf(invoice: Invoice): Promise<Buffer> {
	const labels = labelsFor(invoice.locale);
	const doc = new PDFDocument({
		size: 'A4',
		// bottom margin reserves the footer band, so a long position table never runs into it
		margins: {
			top: mm(BODY_TOP_MM),
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
	doc.registerFont('body', regularFont());
	doc.registerFont('bold', boldFont());
	applyMetadata(doc, invoice, labels);

	doc.addPage();
	drawCropMarks(doc);
	drawAddressField(doc, invoice);
	drawInfoBlock(doc, invoice, labels);
	drawTitle(doc, invoice, labels);
	drawIntro(doc, invoice);

	const reduced = isSmallAmount(invoice);
	drawPositionsTable(doc, invoice, labels, reduced);
	// § 33 UStDV verlangt Entgelt und Steuerbetrag in einer Summe mit Steuersatz auch bei Kleinbetragsrechnungen
	drawTaxSummary(doc, invoice, labels);
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
