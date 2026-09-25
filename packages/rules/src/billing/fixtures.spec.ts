import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { percentOf } from '../money';
import {
	aggregate,
	invoiceForm,
	invoiceTotals,
	isSmallAmountInvoice,
	linesFromCells,
	smallBusinessCheck,
	taxTreatment,
	vatRateFor,
	type ProjectEntry,
	type Rate,
	type TaxCategory,
	type Totals
} from './index';

const BERLIN = 'Europe/Berlin';
const date = (iso: string) => Temporal.PlainDate.from(iso);
const local = (text: string) => Temporal.ZonedDateTime.from(`${text}[${BERLIN}]`).toInstant();

const entry = (
	id: string,
	start: string,
	end: string,
	extra: Partial<ProjectEntry> = {}
): ProjectEntry => ({
	id,
	employeeId: 'e1',
	clientId: 'c1',
	projectId: 'p1',
	taskId: null,
	start: local(start),
	end: local(end),
	workday: date(start.slice(0, 10)),
	billable: true,
	...extra
});

const rate = (id: string, cents: bigint, dims: Partial<Rate> = {}): Rate => ({
	id,
	clientId: null,
	projectId: null,
	taskId: null,
	employeeId: null,
	validFrom: date('2020-01-01'),
	cents,
	...dims
});

const draft = (entries: ProjectEntry[], rates: Rate[], category: TaxCategory) => {
	const cells = aggregate(entries, {
		rates,
		rounding: () => ({ incrementMinutes: 15, mode: 'up' })
	});
	const lines = linesFromCells(cells, category);
	return { lines, totals: invoiceTotals(lines) };
};

const groupsOf = (totals: Totals) =>
	totals.groups.map((group) => [
		group.taxCategory,
		group.taxRateBp,
		group.netCents,
		group.taxCents
	]);

const german = { countryCode: 'DE', isBusiness: true, vatId: 'DE123456789' };

describe('invoices end to end', () => {
	it('bills a german business at 19 percent, the tax taken from the group sum', () => {
		const treatment = taxTreatment({ taxProfile: 'regular' }, german);
		const { lines, totals } = draft(
			[
				entry('mon', '2026-05-11T09:00', '2026-05-11T11:47'),
				entry('tue', '2026-05-12T08:30', '2026-05-12T09:35'),
				entry('tue late', '2026-05-12T13:00', '2026-05-12T13:07'),
				entry('review', '2026-05-13T10:00', '2026-05-13T10:38', { taskId: 't1' }),
				entry('internal', '2026-05-13T14:00', '2026-05-13T15:00', { billable: false })
			],
			[
				rate('default', 9500n),
				rate('review', 10500n, { clientId: 'c1', projectId: 'p1', taskId: 't1' })
			],
			treatment
		);

		expect(treatment).toBe('standard');
		// 167 -> 180 and 65 + 7 -> 75 minutes, the task entry 38 -> 45
		expect(
			lines.map((line) => [
				line.serviceFrom.toString(),
				line.serviceTo.toString(),
				line.minutes,
				line.rateCents,
				line.netCents,
				line.taxRateBp
			])
		).toEqual([
			['2026-05-11', '2026-05-12', 255, 9500n, 40375n, 1900],
			['2026-05-13', '2026-05-13', 45, 10500n, 7875n, 1900]
		]);
		expect(lines.flatMap((line) => line.entryIds)).toEqual(['mon', 'tue', 'tue late', 'review']);
		expect(totals).toMatchObject({ netCents: 48250n, taxCents: 9168n, grossCents: 57418n });
		// rounded per line it would be 7671 + 1496 cents, one less than from the group sum
		expect(lines.reduce((sum, line) => sum + percentOf(line.netCents, line.taxRateBp), 0n)).toBe(
			9167n
		);
		expect(isSmallAmountInvoice(totals.grossCents, treatment)).toBe(false);
		expect(
			invoiceForm({
				grossCents: totals.grossCents,
				treatment,
				isBusiness: true,
				profile: { hasVatId: false, hasTaxNumber: true }
			})
		).toEqual({ legalNotes: [], blockers: [], hints: [] });
		expect(
			invoiceForm({
				grossCents: totals.grossCents,
				treatment,
				isBusiness: true,
				profile: { hasVatId: false, hasTaxNumber: false }
			}).blockers
		).toEqual(['tax_number_missing']);
	});

	it('bills a consumer at 7 percent as a small amount invoice without tax number', () => {
		const { lines, totals } = draft(
			[
				entry('wed', '2026-06-03T14:00', '2026-06-03T15:07'),
				entry('thu', '2026-06-04T09:10', '2026-06-04T09:50')
			],
			[rate('default', 9500n)],
			'reduced'
		);

		expect(lines.map((line) => [line.minutes, line.netCents, line.taxRateBp])).toEqual([
			[120, 19000n, 700]
		]);
		expect(groupsOf(totals)).toEqual([['reduced', 700, 19000n, 1330n]]);
		expect(totals).toMatchObject({ netCents: 19000n, taxCents: 1330n, grossCents: 20330n });
		expect(isSmallAmountInvoice(totals.grossCents, 'reduced')).toBe(true);
		expect(
			invoiceForm({
				grossCents: totals.grossCents,
				treatment: 'reduced',
				isBusiness: false,
				profile: { hasVatId: false, hasTaxNumber: false }
			})
		).toEqual({ legalNotes: ['late_payment_286_consumer'], blockers: [], hints: [] });
	});

	it('splits an invoice across 1 july 2020 into 19, 16 and 5 percent groups', () => {
		const treatment = taxTreatment({ taxProfile: 'regular' }, german);
		const { lines } = draft(
			[
				entry('june', '2020-06-30T09:00', '2020-06-30T10:30'),
				entry('july', '2020-07-01T09:00', '2020-07-01T10:10'),
				entry('july again', '2020-07-02T13:00', '2020-07-02T13:20')
			],
			[rate('default', 9500n)],
			treatment
		);
		const book = {
			netCents: 2990n,
			taxCategory: 'reduced' as const,
			taxRateBp: vatRateFor('reduced', date('2020-07-02'))
		};
		const totals = invoiceTotals([...lines, book]);

		expect(
			lines.map((line) => [
				line.serviceFrom.toString(),
				line.serviceTo.toString(),
				line.minutes,
				line.netCents,
				line.taxRateBp
			])
		).toEqual([
			['2020-06-30', '2020-06-30', 90, 14250n, 1900],
			['2020-07-01', '2020-07-02', 105, 16625n, 1600]
		]);
		// 2707.5 and 149.5 cents both round away from zero
		expect(groupsOf(totals)).toEqual([
			['standard', 1900, 14250n, 2708n],
			['standard', 1600, 16625n, 2660n],
			['reduced', 500, 2990n, 150n]
		]);
		expect(totals).toMatchObject({ netCents: 33865n, taxCents: 5518n, grossCents: 39383n });
		expect(isSmallAmountInvoice(totals.grossCents, treatment)).toBe(false);
		expect(
			invoiceForm({
				grossCents: totals.grossCents,
				treatment,
				isBusiness: true,
				profile: { hasVatId: true, hasTaxNumber: true }
			})
		).toEqual({ legalNotes: [], blockers: [], hints: [] });
	});

	it('bills a small business without tax and with the § 19 note', () => {
		const treatment = taxTreatment(
			{ taxProfile: 'small_business' },
			{ countryCode: 'DE', isBusiness: false, vatId: null }
		);
		const { lines, totals } = draft(
			[
				entry('mon', '2026-03-02T10:00', '2026-03-02T13:40'),
				entry('next mon', '2026-03-09T10:00', '2026-03-09T11:05')
			],
			[rate('default', 6000n)],
			treatment
		);

		expect(treatment).toBe('small_business');
		expect(lines.map((line) => [line.minutes, line.netCents, line.taxRateBp])).toEqual([
			[300, 30000n, 0]
		]);
		expect(groupsOf(totals)).toEqual([['small_business', 0, 30000n, 0n]]);
		expect(totals).toMatchObject({ netCents: 30000n, taxCents: 0n, grossCents: 30000n });
		expect(isSmallAmountInvoice(totals.grossCents, treatment)).toBe(false);
		expect(
			invoiceForm({
				grossCents: totals.grossCents,
				treatment,
				isBusiness: false,
				profile: { hasVatId: false, hasTaxNumber: true }
			})
		).toEqual({
			legalNotes: ['small_business_19', 'late_payment_286_consumer'],
			blockers: [],
			hints: []
		});
		expect(
			smallBusinessCheck({
				previousYearRevenueCents: 1_950_000n,
				issuedThisYearCents: 3_120_000n,
				draftCents: totals.grossCents,
				year: 2026
			})
		).toEqual({
			state: 'ok',
			explanation: {
				key: 'billing.small_business.ok',
				params: {
					issuedThisYearCents: '3120000',
					withDraftCents: '3150000',
					limitCents: '10000000'
				}
			}
		});
	});

	it('bills an eu business under reverse charge with the full form, even below 250 euros', () => {
		const treatment = taxTreatment(
			{ taxProfile: 'regular' },
			{ countryCode: 'NL', isBusiness: true, vatId: 'NL123456789B01' }
		);
		const { lines, totals } = draft(
			[entry('kickoff', '2026-09-14T09:00', '2026-09-14T10:52')],
			[rate('default', 9500n)],
			treatment
		);
		const form = (hasVatId: boolean) =>
			invoiceForm({
				grossCents: totals.grossCents,
				treatment,
				isBusiness: true,
				profile: { hasVatId, hasTaxNumber: true }
			});

		expect(treatment).toBe('reverse_charge');
		expect(lines.map((line) => [line.minutes, line.netCents, line.taxRateBp])).toEqual([
			[120, 19000n, 0]
		]);
		expect(groupsOf(totals)).toEqual([['reverse_charge', 0, 19000n, 0n]]);
		expect(totals).toMatchObject({ netCents: 19000n, taxCents: 0n, grossCents: 19000n });
		expect(isSmallAmountInvoice(totals.grossCents, treatment)).toBe(false);
		expect(form(true)).toEqual({
			legalNotes: ['reverse_charge_13b'],
			blockers: [],
			hints: ['service_deadline_14a_1']
		});
		expect(form(false).blockers).toEqual(['vat_id_missing']);
	});
});
