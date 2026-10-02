import type { Invoice } from '@zeit/shared';
import PDFDocument from 'pdfkit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoiceFixture, invoiceLineFixture, taxGroupFixture } from './invoice.fixture';
import { buildInvoicePdf } from './pdf';
import { pdfParse } from './pdf-parse.fixture';
import { MAX_PAGES, PageLimitError } from './render-limit';
import { buildTimeReportPdf } from './time-report-pdf';
import { timeReportFixture } from './time-report.fixture';

const PT_PER_MM = 72 / 25.4;
const A4_HEIGHT_PT = 841.89;

type Run = { page: number; x: number; y: number; width: number; size: number; text: string };

const flat = (raw: string) => raw.replace(/\s+/g, ' ').trim();

async function read(pdf: Buffer) {
	const runs: Run[] = [];
	let page = 0;
	const { text, info } = await pdfParse(pdf, {
		pagerender: async (current) => {
			page += 1;
			const { items } = await current.getTextContent();
			let lines = '';
			for (const { str, width, transform } of items) {
				const [size, , , , x, y] = transform;
				runs.push({
					page,
					x: x / PT_PER_MM,
					y: (A4_HEIGHT_PT - y) / PT_PER_MM,
					width: width / PT_PER_MM,
					size,
					text: str
				});
				lines += `\n${str}`;
			}
			return lines;
		}
	});
	return { runs, text: flat(text), info };
}

const render = async (invoice: Invoice) => read(await buildInvoicePdf(invoice));

const totals = (netCents: string, taxCents: string, grossCents: string) => ({
	netCents,
	taxCents,
	grossCents,
	explanation: { key: 'billing.totals', params: {} }
});

const item = (overrides: Parameters<typeof invoiceLineFixture>[0]) =>
	invoiceLineFixture({
		kind: 'item',
		projectId: null,
		minutes: null,
		derivation: { entries: [], rounding: null, rate: null },
		...overrides
	});

const cancellation = (grossCents: string, netCents: string, taxCents: string) =>
	invoiceFixture({
		kind: 'cancellation',
		number: 'RE-2026-0009',
		refersTo: {
			id: '66666666-6666-6666-6666-666666666666',
			number: 'RE-2026-0007',
			issueDate: '2026-09-01'
		},
		lines: [invoiceLineFixture({ minutes: -480, netCents: `-${netCents}` })],
		taxGroups: [taxGroupFixture({ netCents: `-${netCents}`, taxCents: `-${taxCents}` })],
		totals: totals(`-${netCents}`, `-${taxCents}`, `-${grossCents}`)
	});

const smallAmount = invoiceFixture({
	lines: [invoiceLineFixture({ minutes: 120, netCents: '19000' })],
	taxGroups: [taxGroupFixture({ netCents: '19000', taxCents: '3610' })],
	totals: totals('19000', '3610', '22610')
});

const vanDijk = {
	...invoiceFixture().buyer,
	name: 'Van Dijk Media B.V.',
	street: 'Keizersgracht 221',
	postalCode: '1016 DV',
	city: 'Amsterdam',
	countryCode: 'NL',
	vatId: 'NL853746291B01'
};

describe('small amount invoice (§ 33 UStDV)', () => {
	it('labels no cancellation above 250 € as one, only the ones that stay below', async () => {
		expect((await render(cancellation('90440', '76000', '14440'))).text).not.toContain(
			'Kleinbetragsrechnung'
		);
		expect((await render(cancellation('22610', '19000', '3610'))).text).toContain(
			'Kleinbetragsrechnung'
		);
	});

	it('keeps the full table, the amount column says net and the total stays the only Gesamtbetrag', async () => {
		const { text } = await render(smallAmount);
		expect(text).toContain('Kleinbetragsrechnung');
		expect(text).toMatch(/Beschreibung ?Menge ?Einzelpreis ?Steuersatz ?Netto/);
		expect(text.match(/Gesamtbetrag/g)).toHaveLength(1);
		expect(text).toContain('Umsatzsteuer 19 % 36,10 €');
		expect(text).toContain('Gesamtbetrag 226,10 €');
	});
});

describe('tax summary', () => {
	it('lists every group, the exempt one included, so net and tax add up to the total', async () => {
		const { text } = await render(
			invoiceFixture({
				lines: [
					invoiceLineFixture(),
					item({
						id: 'exempt',
						position: 2,
						description: 'Prüfungsgebühr',
						quantityMilli: '1000',
						unit: 'C62',
						unitPriceCents: '5000',
						netCents: '5000',
						taxCategory: 'exempt',
						taxRateBp: 0
					})
				],
				taxGroups: [
					taxGroupFixture(),
					taxGroupFixture({ taxCategory: 'exempt', taxRateBp: 0, netCents: '5000', taxCents: '0' })
				],
				totals: totals('81000', '14440', '95440')
			})
		);
		expect(text).toContain('Nettobetrag 19 % 760,00 €');
		expect(text).toContain('Nettobetrag steuerfrei 50,00 €');
		expect(text).toContain('Umsatzsteuer 19 % 144,40 €');
		expect(text).toContain('Gesamtbetrag 954,40 €');
	});

	it('shows a small business only the invoice amount, without rate column or net line', async () => {
		const exemptLine = { taxCategory: 'small_business' as const, taxRateBp: 0 };
		const { text } = await render(
			invoiceFixture({
				taxProfile: 'small_business',
				seller: { ...invoiceFixture().seller, vatId: null },
				lines: [invoiceLineFixture(exemptLine)],
				taxGroups: [taxGroupFixture({ ...exemptLine, taxCents: '0' })],
				totals: totals('76000', '0', '76000')
			})
		);
		expect(text).toMatch(/Beschreibung ?Menge ?Einzelpreis ?Betrag/);
		expect(text).toContain('Rechnungsbetrag 760,00 €');
		expect(text).not.toContain('Steuersatz');
		expect(text).not.toContain('Nettobetrag');
		expect(text).not.toContain('Gesamtbetrag');
	});

	it('keeps the summary together on one page', async () => {
		const many = Array.from({ length: 16 }, (_, index) =>
			invoiceLineFixture({
				id: `line-${index}`,
				position: index + 1,
				description: `Position ${index + 1}`
			})
		);
		for (let count = 6; count <= 16; count++) {
			const { runs } = await render(invoiceFixture({ lines: many.slice(0, count) }));
			const pages = new Set(
				runs
					.filter((run) => /^(Nettobetrag|Umsatzsteuer|Gesamtbetrag)/.test(run.text))
					.map((run) => run.page)
			);
			expect(pages.size, `${count} lines`).toBe(1);
		}
	}, 30_000);
});

describe('positions table', () => {
	it('runs at 9 pt without an intro and keeps the tax rate header in one piece', async () => {
		const { runs } = await render(invoiceFixture({ introText: null }));
		const header = runs.find((run) => run.text === 'Beschreibung')!;
		expect(header.size).toBe(9);
		expect(runs.some((run) => run.text === 'Steuersatz')).toBe(true);
		const rate = runs.find((run) => run.text === '19 %')!;
		const amount = runs.find((run) => run.text === '760,00 €' && run.page === 1 && run.y < 200)!;
		expect(amount.x + amount.width - rate.x).toBeGreaterThanOrEqual(25 + 30);
	});

	it('shows time as hours with an hourly rate, never as a pile of minutes', async () => {
		const { text } = await render(invoiceFixture());
		expect(text).toContain('8:00 Std.');
		expect(text).toContain('95,00 €/Std.');
		expect(text).toContain('7:53 Std. erfasst, je Tag auf 15 Min. aufgerundet');
		expect(text).not.toContain('480 Min.');
	});

	it('writes units as words instead of UN codes', async () => {
		const lines = [
			item({
				id: 'book',
				position: 1,
				description: 'Fachbuch',
				quantityMilli: '2000',
				unit: 'C62',
				unitPriceCents: '3990',
				netCents: '7980'
			}),
			item({
				id: 'day',
				position: 2,
				description: 'Schulung',
				quantityMilli: '2500',
				unit: 'DAY',
				unitPriceCents: '80000',
				netCents: '200000'
			}),
			item({
				id: 'one',
				position: 3,
				description: 'Vorbereitung',
				quantityMilli: '1000',
				unit: 'DAY',
				unitPriceCents: '80000',
				netCents: '80000'
			}),
			item({
				id: 'flat',
				position: 4,
				description: 'Reisekosten',
				quantityMilli: '1000',
				unit: 'LS',
				unitPriceCents: '12000',
				netCents: '12000'
			}),
			item({
				id: 'hours',
				position: 5,
				description: 'Support',
				quantityMilli: '1500',
				unit: 'HUR',
				unitPriceCents: '9500',
				netCents: '14250'
			})
		];
		const de = (await render(invoiceFixture({ lines }))).text;
		for (const unit of ['2 Stk.', '2,5 Tage', '1 Tag', '1 pauschal', '1,5 Std.']) {
			expect(de, unit).toContain(unit);
		}
		const en = (await render(invoiceFixture({ lines, locale: 'en' }))).text;
		for (const unit of ['2 pcs', '2.5 days', '1 day', '1 lump sum', '1.5 h']) {
			expect(en, unit).toContain(unit);
		}
		for (const code of ['C62', 'DAY', 'LS', 'HUR']) {
			expect(de).not.toMatch(new RegExp(`\\d ${code}\\b`));
		}
	});
});

describe('address field (DIN 5008)', () => {
	it('ends a foreign address with the country written out in capitals', async () => {
		const de = await render(invoiceFixture({ buyer: vanDijk }));
		const field = de.runs
			.filter((run) => run.x < 30 && run.y > 50 && run.y < 95)
			.map((run) => run.text);
		expect(field.at(-1)).toBe('NIEDERLANDE');
		const en = await render(invoiceFixture({ buyer: vanDijk, locale: 'en' }));
		expect(en.text).toContain('1016 DV Amsterdam NETHERLANDS');
	});

	it('prints no country line for a german buyer', async () => {
		const { text } = await render(invoiceFixture());
		expect(text).not.toContain('DEUTSCHLAND');
	});

	it('keeps the return address on one line within 85 mm, a long name is cut short', async () => {
		const legalName =
			'Müller & Co. Softwareentwicklung und Beratung für öffentliche Auftraggeber GmbH';
		for (const invoice of [
			invoiceFixture(),
			invoiceFixture({ seller: { ...invoiceFixture().seller, legalName } })
		]) {
			const { runs } = await render(invoice);
			const line = runs.filter((run) => run.y > 45 && run.y < 50);
			expect(line).toHaveLength(1);
			expect(line[0]!.width).toBeLessThanOrEqual(85);
		}
		const { runs } = await render(
			invoiceFixture({ seller: { ...invoiceFixture().seller, legalName } })
		);
		expect(runs.find((run) => run.y > 45 && run.y < 50)!.text).toMatch(/(…|\.\.\.)$/);
	});
});

describe('info block', () => {
	it('names a Leitweg-ID as such and any other buyer reference as the customer reference', async () => {
		const leitweg = await render(
			invoiceFixture({ buyer: { ...invoiceFixture().buyer, buyerReference: '14713000-DIGI01-62' } })
		);
		expect(leitweg.text).toContain('Leitweg-ID 14713000-DIGI01-62');
		const order = await render(
			invoiceFixture({ buyer: { ...invoiceFixture().buyer, buyerReference: 'PO-2026-118' } })
		);
		expect(order.text).toContain('Ihre Referenz PO-2026-118');
		expect(order.text).not.toContain('Leitweg');
	});
});

describe('cancellation', () => {
	it('names the original with number and date and asks for no payment', async () => {
		const { text } = await render(cancellation('90440', '76000', '14440'));
		expect(text).toContain('Stornorechnung storniert Rechnung RE-2026-0007 vom 01.09.2026');
		expect(text).toContain('-904,40 €');
		expect(text).not.toContain('IBAN');
		expect(text).not.toContain('Bankverbindung');
		expect(text).not.toContain('Zahlbar');
	});

	it('names the original in english with the english date', async () => {
		const { text } = await render({ ...cancellation('90440', '76000', '14440'), locale: 'en' });
		expect(text).toContain('cancels invoice RE-2026-0007 dated 1 September 2026');
	});
});

describe('readability', () => {
	it('prints legal notes in 9 pt', async () => {
		const note = 'Bei Zahlungsverzug fallen ab 30 Tagen nach Fälligkeit';
		const { runs } = await render(
			invoiceFixture({
				legalNotes: [`${note} und Zugang dieser Rechnung Verzugszinsen an (§ 286 Abs. 3 BGB).`]
			})
		);
		const first = runs.find((run) => run.text.startsWith(note))!;
		expect(first.size).toBeGreaterThanOrEqual(9);
	});

	it('starts a following page near the top instead of at 100 mm', async () => {
		const many = Array.from({ length: 40 }, (_, index) =>
			invoiceLineFixture({
				id: `line-${index}`,
				position: index + 1,
				description: `Position ${index + 1}`
			})
		);
		const { runs } = await render(invoiceFixture({ lines: many }));
		const top = Math.min(...runs.filter((run) => run.page === 2).map((run) => run.y));
		expect(top).toBeLessThan(35);
	});

	it('takes the english date format of the XML', async () => {
		const { text } = await render(invoiceFixture({ locale: 'en' }));
		expect(text).toContain('Invoice date 1 September 2026');
		expect(text).toContain('Service period 1 August 2026 – 31 August 2026');
		expect(text).toContain('Due on 15 September 2026.');
	});
});

describe('third country', () => {
	it('leaves the own vat id off the footer and keeps the tax number', async () => {
		const outside = { taxCategory: 'outside_scope' as const, taxRateBp: 0 };
		const { text } = await render(
			invoiceFixture({
				buyer: { ...vanDijk, countryCode: 'CH', city: 'Zürich', vatId: null },
				lines: [invoiceLineFixture(outside)],
				taxGroups: [taxGroupFixture({ ...outside, taxCents: '0' })],
				totals: totals('76000', '0', '76000')
			})
		);
		expect(text).not.toContain('DE123456789');
		expect(text).toContain('Steuernummer: 123/4567/8901');
		expect(text).toContain('Nettobetrag nicht steuerbar 760,00 €');
		expect(text).toContain('SCHWEIZ');
	});
});

describe('XMP metadata', () => {
	const seller = { ...invoiceFixture().seller, legalName: 'Müller & Co. <Kanzlei> "Nord"' };

	it('escapes title and author in the XMP packet and keeps the info dictionary readable', async () => {
		const pdf = await buildInvoicePdf(invoiceFixture({ seller }));
		const xmp = pdf.toString('utf8');
		expect(xmp).toContain('<rdf:li>Müller &amp; Co. &lt;Kanzlei&gt; &quot;Nord&quot;</rdf:li>');
		expect(xmp).not.toContain('<rdf:li>Müller & Co.');
		const { info } = await read(pdf);
		expect(info.Author).toBe('Müller & Co. <Kanzlei> "Nord"');
	});

	it('does the same for the time report', async () => {
		const pdf = await buildTimeReportPdf(
			timeReportFixture({ client: { name: 'Müller & Co.', number: null } })
		);
		expect(pdf.toString('utf8')).toContain('Stundennachweis Müller &amp; Co.</rdf:li>');
	});
});

describe('time report', () => {
	it('marks a report from a sandbox as specimen', async () => {
		const specimen = await read(await buildTimeReportPdf(timeReportFixture({ specimen: true })));
		expect(specimen.text).toContain('Muster – Stundennachweis aus dem Musterbetrieb');
		const real = await read(await buildTimeReportPdf(timeReportFixture()));
		expect(real.text).not.toContain('Muster');
	});
});

describe('specimen watermark (X-01)', () => {
	const GERMAN = 'Musterrechnung – keine Rechnung im Sinne des § 14 UStG';
	const ENGLISH = 'Specimen invoice – not an invoice within the meaning of § 14 UStG';
	const lines = Array.from({ length: 40 }, (_, index) =>
		invoiceLineFixture({ id: `line-${index}`, position: index + 1, description: `Position ${index + 1}` })
	);
	const specimen = (locale: Invoice['locale']) =>
		render(invoiceFixture({ specimen: true, number: 'MUSTER-2026-0001', lines, locale }));
	const pagesOf = (runs: Run[]) => [...new Set(runs.map((run) => run.page))];

	it('puts the german wording on every page of a german specimen and nothing in english', async () => {
		const { runs } = await specimen('de');
		expect(pagesOf(runs).length).toBeGreaterThan(1);
		for (const page of pagesOf(runs)) {
			expect(runs.filter((run) => run.page === page && run.text === GERMAN), `page ${page}`).toHaveLength(1);
		}
		expect(runs.some((run) => run.text === ENGLISH)).toBe(false);
	});

	it('keeps the german wording on an english specimen and adds the english one as a second line', async () => {
		const { runs } = await specimen('en');
		for (const page of pagesOf(runs)) {
			const german = runs.find((run) => run.page === page && run.text === GERMAN);
			const english = runs.find((run) => run.page === page && run.text === ENGLISH);
			expect(german, `page ${page}`).toBeDefined();
			const below = (english!.x - german!.x + english!.y - german!.y) / Math.SQRT2;
			expect(below, `page ${page}`).toBeGreaterThan(7);
			expect(below, `page ${page}`).toBeLessThan(11);
		}
	});

	it('shows draft and both specimen lines on an english sandbox draft, none of them cut off at the edge', async () => {
		const { runs, text } = await render(
			invoiceFixture({ status: 'draft', specimen: true, number: null, issueDate: null, dueDate: null, locale: 'en' })
		);
		expect(text).toContain('Draft – not an invoice');
		for (const wording of [GERMAN, ENGLISH]) {
			const line = runs.find((run) => run.text === wording)!;
			const along = line.width / Math.SQRT2;
			expect(line.x, wording).toBeGreaterThan(0);
			expect(line.y, wording).toBeLessThan(297);
			expect(line.x + along, wording).toBeLessThan(210);
			expect(line.y - along, wording).toBeGreaterThan(0);
		}
	});
});

describe('page limit (D-01)', () => {
	afterEach(() => vi.restoreAllMocks());

	const positions = (count: number) =>
		Array.from({ length: count }, (_, index) =>
			invoiceLineFixture({ id: `line-${index}`, position: index + 1, description: `Position ${index + 1}` })
		);
	const addPage = () =>
		vi.spyOn((PDFDocument as unknown as { prototype: PDFKit.PDFDocument }).prototype, 'addPage');

	it('still renders 500 short positions within 50 pages', async () => {
		const { numpages } = await pdfParse(await buildInvoicePdf(invoiceFixture({ lines: positions(500) })));
		expect(numpages).toBeLessThanOrEqual(MAX_PAGES);
	});

	it('gives up on an invoice at page 51 instead of laying out the rest', async () => {
		const pages = addPage();
		await expect(buildInvoicePdf(invoiceFixture({ lines: positions(2000) }))).rejects.toBeInstanceOf(
			PageLimitError
		);
		expect(pages).toHaveBeenCalledTimes(MAX_PAGES + 1);
	});

	it('gives up on a time report at page 51 the same way', async () => {
		const entries = Array.from({ length: 2000 }, () => timeReportFixture().entries[0]!);
		const pages = addPage();
		await expect(buildTimeReportPdf(timeReportFixture({ entries }))).rejects.toBeInstanceOf(PageLimitError);
		expect(pages).toHaveBeenCalledTimes(MAX_PAGES + 1);
	});
});
