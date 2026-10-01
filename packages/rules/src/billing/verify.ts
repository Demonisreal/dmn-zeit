import type { Temporal } from 'temporal-polyfill';
import { vatRateFor, type TaxCategory, type TaxProfile } from './index';

export type TaxedPosition = {
	position: number;
	kind: 'time' | 'item';
	taxCategory: TaxCategory;
	taxRateBp: number;
	serviceDate: Temporal.PlainDate;
};

export type TaxMismatch =
	| { code: 'tax_profile_mismatch'; params: { position: number; taxProfile: TaxProfile } }
	| { code: 'tax_category_mismatch'; params: { position: number; treatment: TaxCategory } }
	| { code: 'tax_rate_mismatch'; params: { position: number; expectedBp: number } };

const PER_POSITION: readonly TaxCategory[] = ['standard', 'reduced', 'exempt'];

const allowedCategories = (treatment: TaxCategory, kind: TaxedPosition['kind']) =>
	treatment === 'standard' && kind === 'item' ? PER_POSITION : [treatment];

export const taxMismatches = (invoice: {
	taxProfile: TaxProfile;
	treatment: TaxCategory;
	positions: readonly TaxedPosition[];
}): TaxMismatch[] => {
	const { taxProfile, treatment } = invoice;
	return invoice.positions.flatMap(
		({ position, kind, taxCategory, taxRateBp, serviceDate }): TaxMismatch[] => {
			if ((taxCategory === 'small_business') !== (taxProfile === 'small_business')) {
				return [{ code: 'tax_profile_mismatch', params: { position, taxProfile } }];
			}
			if (!allowedCategories(treatment, kind).includes(taxCategory)) {
				return [{ code: 'tax_category_mismatch', params: { position, treatment } }];
			}
			const expectedBp = vatRateFor(taxCategory, serviceDate);
			return taxRateBp === expectedBp
				? []
				: [{ code: 'tax_rate_mismatch', params: { position, expectedBp } }];
		}
	);
};
