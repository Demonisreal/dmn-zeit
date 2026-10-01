import * as rules from '@zeit/rules';
import * as shared from '@zeit/shared';
import { describe, expect, expectTypeOf, it } from 'vitest';

// expectTypeOf fails in tsc -p tsconfig.test.json, vitest run passes it either way
describe('enums in @zeit/rules and @zeit/shared', () => {
	it('agree on the arbzg codes', () => {
		expectTypeOf<rules.ArbzgCode>().toEqualTypeOf<shared.ArbzgCode>();
	});

	it('agree on the holiday codes', () => {
		expectTypeOf<rules.HolidayCode>().toEqualTypeOf<shared.HolidayCode>();
	});

	it('agree on the federal states', () => {
		expect(new Set(rules.FEDERAL_STATES)).toEqual(new Set(shared.federalStates));
		expectTypeOf<rules.FederalState>().toEqualTypeOf<shared.FederalState>();
	});

	it('agree on the weekdays', () => {
		expectTypeOf<rules.Weekday>().toEqualTypeOf<shared.Weekday>();
	});

	it('agree on the flex cap modes under their two names', () => {
		expectTypeOf<rules.CapMode>().toEqualTypeOf<shared.FlexCapMode>();
	});

	it('agree on the flex booking types', () => {
		expectTypeOf<rules.FlexBookingType>().toEqualTypeOf<shared.FlexBookingType>();
	});

	it('know a vat id format for exactly the eu countries and germany', () => {
		expect(new Set(Object.keys(shared.vatIdFormats))).toEqual(
			new Set([...rules.EU_COUNTRY_CODES, 'DE'])
		);
	});

	it('agree on the sources of a project entry', () => {
		expectTypeOf<rules.SourcedEntry['source']>().toEqualTypeOf<shared.ProjectEntrySource>();
	});
});
