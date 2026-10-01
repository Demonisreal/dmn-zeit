import { fc, test } from '@fast-check/vitest';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { taxTreatment, vatRateFor, type TaxCategory, type TaxProfile } from './index';
import { taxMismatches, type TaxedPosition } from './verify';

const date = (iso: string) => Temporal.PlainDate.from(iso);

const at = (
	position: number,
	kind: TaxedPosition['kind'],
	taxCategory: TaxCategory,
	taxRateBp: number,
	serviceDate = '2026-05-31'
): TaxedPosition => ({ position, kind, taxCategory, taxRateBp, serviceDate: date(serviceDate) });

const regular = { taxProfile: 'regular' as const, treatment: 'standard' as const };

describe('taxMismatches', () => {
	it('lets a standard invoice with reduced and exempt free positions through', () => {
		expect(
			taxMismatches({
				...regular,
				positions: [
					at(1, 'time', 'standard', 1900),
					at(2, 'item', 'reduced', 700),
					at(3, 'item', 'exempt', 0),
					at(4, 'item', 'standard', 1900)
				]
			})
		).toEqual([]);
	});

	it('has nothing to say about an invoice without positions', () => {
		expect(taxMismatches({ ...regular, positions: [] })).toEqual([]);
	});

	it('keeps reduced and exempt to free positions, a time position follows the invoice', () => {
		expect(
			taxMismatches({
				...regular,
				positions: [at(1, 'time', 'reduced', 700), at(2, 'time', 'exempt', 0)]
			})
		).toEqual([
			{ code: 'tax_category_mismatch', params: { position: 1, treatment: 'standard' } },
			{ code: 'tax_category_mismatch', params: { position: 2, treatment: 'standard' } }
		]);
	});

	it.each(['reverse_charge', 'outside_scope'] as const)(
		'refuses %s on a single position of a standard invoice',
		(taxCategory) => {
			expect(taxMismatches({ ...regular, positions: [at(1, 'item', taxCategory, 0)] })).toEqual([
				{ code: 'tax_category_mismatch', params: { position: 1, treatment: 'standard' } }
			]);
		}
	);

	it('binds every position of a reverse charge invoice', () => {
		expect(
			taxMismatches({
				taxProfile: 'regular',
				treatment: 'reverse_charge',
				positions: [
					at(1, 'time', 'reverse_charge', 0),
					at(2, 'item', 'standard', 1900),
					at(3, 'item', 'reduced', 700),
					at(4, 'item', 'reverse_charge', 0)
				]
			})
		).toEqual([
			{ code: 'tax_category_mismatch', params: { position: 2, treatment: 'reverse_charge' } },
			{ code: 'tax_category_mismatch', params: { position: 3, treatment: 'reverse_charge' } }
		]);
	});

	it('binds every position of an invoice to a third country', () => {
		expect(
			taxMismatches({
				taxProfile: 'regular',
				treatment: 'outside_scope',
				positions: [at(1, 'time', 'outside_scope', 0), at(2, 'item', 'exempt', 0)]
			})
		).toEqual([
			{ code: 'tax_category_mismatch', params: { position: 2, treatment: 'outside_scope' } }
		]);
	});

	it('shows no tax on the invoice of a small business', () => {
		expect(
			taxMismatches({
				taxProfile: 'small_business',
				treatment: 'small_business',
				positions: [at(1, 'time', 'small_business', 0), at(2, 'item', 'standard', 1900)]
			})
		).toEqual([
			{ code: 'tax_profile_mismatch', params: { position: 2, taxProfile: 'small_business' } }
		]);
	});

	it('keeps the small business category off a regular invoice', () => {
		expect(taxMismatches({ ...regular, positions: [at(1, 'item', 'small_business', 0)] })).toEqual([
			{ code: 'tax_profile_mismatch', params: { position: 1, taxProfile: 'regular' } }
		]);
	});

	it('stops a draft whose tax profile was switched after it was made', () => {
		expect(
			taxMismatches({
				taxProfile: 'regular',
				treatment: 'small_business',
				positions: [at(1, 'time', 'standard', 1900)]
			})
		).toEqual([
			{ code: 'tax_category_mismatch', params: { position: 1, treatment: 'small_business' } }
		]);
		expect(
			taxMismatches({
				taxProfile: 'small_business',
				treatment: 'standard',
				positions: [at(1, 'item', 'small_business', 0)]
			})
		).toEqual([{ code: 'tax_category_mismatch', params: { position: 1, treatment: 'standard' } }]);
	});

	it.each([
		['standard', 1900, '2020-08-15', 1600],
		['reduced', 700, '2020-12-31', 500],
		['standard', 1600, '2021-01-01', 1900],
		['reduced', 500, '2020-06-30', 700]
	] as const)(
		'wants the rate of the service day: %s at %i on %s should be %i',
		(taxCategory, taxRateBp, serviceDate, expectedBp) => {
			expect(
				taxMismatches({
					...regular,
					positions: [at(1, 'item', taxCategory, taxRateBp, serviceDate)]
				})
			).toEqual([{ code: 'tax_rate_mismatch', params: { position: 1, expectedBp } }]);
		}
	);

	it('shows no tax under reverse charge', () => {
		expect(
			taxMismatches({
				taxProfile: 'regular',
				treatment: 'reverse_charge',
				positions: [at(7, 'time', 'reverse_charge', 1900)]
			})
		).toEqual([{ code: 'tax_rate_mismatch', params: { position: 7, expectedBp: 0 } }]);
	});

	it('names each broken position once and in order', () => {
		expect(
			taxMismatches({
				...regular,
				positions: [
					at(1, 'time', 'standard', 1900),
					at(2, 'item', 'reverse_charge', 1900),
					at(3, 'item', 'reduced', 700),
					at(4, 'item', 'reduced', 1900, '2020-09-01')
				]
			})
		).toEqual([
			{ code: 'tax_category_mismatch', params: { position: 2, treatment: 'standard' } },
			{ code: 'tax_rate_mismatch', params: { position: 4, expectedBp: 500 } }
		]);
	});
});

const CATEGORIES: readonly TaxCategory[] = [
	'standard',
	'reduced',
	'exempt',
	'reverse_charge',
	'outside_scope',
	'small_business'
];

const allowedFor = (treatment: TaxCategory, kind: TaxedPosition['kind']): readonly TaxCategory[] =>
	treatment === 'standard' && kind === 'item' ? ['standard', 'reduced', 'exempt'] : [treatment];

const anyDay = fc.oneof(
	fc.integer({ min: 0, max: 3286 }).map((days) => date('2019-01-01').add({ days })),
	fc.constantFrom('2020-06-30', '2020-07-01', '2020-12-31', '2021-01-01').map(date)
);

const anyClient = fc.record({
	countryCode: fc.constantFrom('DE', 'NL', 'FR', 'AT', 'CH', 'US'),
	isBusiness: fc.boolean(),
	vatId: fc.constantFrom(null, 'NL853746291B01')
});

const anyProfile = fc.constantFrom<TaxProfile>('regular', 'small_business');

const build = (
	taxProfile: TaxProfile,
	client: { countryCode: string; isBusiness: boolean; vatId: string | null },
	plan: readonly { kind: TaxedPosition['kind']; serviceDate: Temporal.PlainDate; pick: number }[]
) => {
	const treatment = taxTreatment({ taxProfile }, client);
	const positions = plan.map(({ kind, serviceDate, pick }, i): TaxedPosition => {
		const allowed = allowedFor(treatment, kind);
		const taxCategory = allowed[pick % allowed.length]!;
		return {
			position: i + 1,
			kind,
			taxCategory,
			taxRateBp: vatRateFor(taxCategory, serviceDate),
			serviceDate
		};
	});
	return { taxProfile, treatment, positions };
};

const anyPlan = fc.array(
	fc.record({
		kind: fc.constantFrom<TaxedPosition['kind']>('time', 'item'),
		serviceDate: anyDay,
		pick: fc.nat()
	}),
	{ minLength: 1, maxLength: 12 }
);

const anyInvoice = fc
	.record({ taxProfile: anyProfile, client: anyClient, plan: anyPlan })
	.map(({ taxProfile, client, plan }) => build(taxProfile, client, plan));

describe('taxMismatches properties', () => {
	test.prop([anyInvoice], { numRuns: 1000 })(
		'an invoice the way treatment, profile and rate table build it goes through',
		(invoice) => {
			expect(taxMismatches(invoice)).toEqual([]);
		}
	);

	test.prop([anyInvoice, fc.nat(), fc.integer({ min: 1, max: 10_000 })], { numRuns: 1000 })(
		'a wrong rate is caught at its position and nowhere else',
		(invoice, pick, delta) => {
			const i = pick % invoice.positions.length;
			const target = invoice.positions[i]!;
			const positions = invoice.positions.with(i, {
				...target,
				taxRateBp: target.taxRateBp + delta
			});
			expect(taxMismatches({ ...invoice, positions })).toEqual([
				{ code: 'tax_rate_mismatch', params: { position: i + 1, expectedBp: target.taxRateBp } }
			]);
		}
	);

	test.prop([anyInvoice, fc.nat(), fc.nat()], { numRuns: 1000 })(
		'a category outside what the invoice allows is caught at its position and nowhere else',
		(invoice, pick, choice) => {
			const i = pick % invoice.positions.length;
			const target = invoice.positions[i]!;
			const foreign = CATEGORIES.filter(
				(category) => !allowedFor(invoice.treatment, target.kind).includes(category)
			);
			const taxCategory = foreign[choice % foreign.length]!;
			const positions = invoice.positions.with(i, {
				...target,
				taxCategory,
				taxRateBp: vatRateFor(taxCategory, target.serviceDate)
			});
			const found = taxMismatches({ ...invoice, positions });
			expect(found).toHaveLength(1);
			expect(found[0]!.params.position).toBe(i + 1);
			expect(found[0]!.code).toBe(
				(taxCategory === 'small_business') !== (invoice.taxProfile === 'small_business')
					? 'tax_profile_mismatch'
					: 'tax_category_mismatch'
			);
		}
	);

	test.prop([anyProfile, anyClient, anyPlan], { numRuns: 1000 })(
		'once the tax profile is switched no position of an older draft goes through',
		(taxProfile, client, plan) => {
			const draft = build(taxProfile, client, plan);
			const switched = taxTreatment(
				{ taxProfile: taxProfile === 'regular' ? 'small_business' : 'regular' },
				client
			);
			const found = taxMismatches({ ...draft, treatment: switched });
			expect(found.map((mismatch) => mismatch.params.position)).toEqual(
				draft.positions.map((line) => line.position)
			);
		}
	);
});
