import { describe, expect, it } from 'vitest';
import { centsSchema } from './common';
import {
	buyerVatIdValid,
	createClientSchema,
	createProjectEntrySchema,
	leitwegIdValid,
	updateClientSchema,
	updateProjectEntrySchema,
	vatIdFormats
} from './projects';

const projectId = '3d2c1b0a-9e8f-4a7b-b6c5-d4e3f2a1b0c9';
const entry = {
	projectId,
	startedAt: '2026-09-24T09:00:00+02:00',
	endedAt: '2026-09-24T12:30:00+02:00',
	note: 'Workshop Datenmodell'
};

describe('createClientSchema', () => {
	it('fills in the defaults of a german business client', () => {
		expect(createClientSchema.parse({ name: 'Stadtwerke Kassel' })).toEqual({
			name: 'Stadtwerke Kassel',
			countryCode: 'DE',
			isBusiness: true,
			invoiceLocale: 'de'
		});
	});

	it.each([{ archivedAt: '2026-09-24T09:00:00+02:00' }, { restrictedAt: null }, { id: projectId }])(
		'refuses %o on create',
		(extra) => {
			expect(createClientSchema.safeParse({ name: 'Stadtwerke Kassel', ...extra }).success).toBe(
				false
			);
		}
	);

	it('wants an upper case country code', () => {
		expect(createClientSchema.safeParse({ name: 'Acme Ltd', countryCode: 'gb' }).success).toBe(
			false
		);
	});
});

describe('updateClientSchema', () => {
	it('leaves out what the patch does not touch', () => {
		expect(updateClientSchema.parse({ city: 'Kassel' })).toEqual({ city: 'Kassel' });
	});

	it('does not archive through a patch', () => {
		expect(updateClientSchema.safeParse({ archivedAt: '2026-09-24T09:00:00+02:00' }).success).toBe(
			false
		);
	});

	it('checks the vat id against the country that comes along', () => {
		expect(
			updateClientSchema.safeParse({ countryCode: 'AT', vatId: 'DE123456789' }).error?.issues
		).toMatchObject([{ message: 'format.vatId', path: ['vatId'], params: { countryCode: 'AT' } }]);
		expect(updateClientSchema.safeParse({ countryCode: 'NL', vatId: null }).success).toBe(true);
	});

	it('leaves the pair to the service when only one half comes along', () => {
		expect(updateClientSchema.safeParse({ vatId: 'DE12' }).success).toBe(true);
		expect(updateClientSchema.safeParse({ countryCode: 'NL' }).success).toBe(true);
	});
});

const valid: [string, string][] = [
	['AT', 'ATU12345678'],
	['BE', 'BE0123456789'],
	['BG', 'BG1234567890'],
	['CY', 'CY12345678L'],
	['CZ', 'CZ123456789'],
	['DE', 'DE123456789'],
	['DK', 'DK12345678'],
	['EE', 'EE123456789'],
	['ES', 'ESB12345678'],
	['ES', 'ES12345678Z'],
	['FI', 'FI12345678'],
	['FR', 'FR12345678901'],
	['FR', 'FRAB123456789'],
	['GR', 'EL123456789'],
	['HR', 'HR12345678901'],
	['HU', 'HU12345678'],
	['IE', 'IE1234567T'],
	['IE', 'IE1234567WA'],
	['IE', 'IE8Z49289F'],
	['IT', 'IT12345678901'],
	['LT', 'LT123456789012'],
	['LU', 'LU12345678'],
	['LV', 'LV12345678901'],
	['MT', 'MT12345678'],
	['NL', 'NL853746291B01'],
	['PL', 'PL1234567890'],
	['PT', 'PT123456789'],
	['RO', 'RO18547290'],
	['SE', 'SE123456789001'],
	['SI', 'SI12345678'],
	['SK', 'SK1234567890']
];

const invalid: [string, string][] = [
	['NL', 'DE123456789'],
	['NL', 'NL853746291'],
	['NL', 'nl853746291b01'],
	['NL', 'NL 853746291 B01'],
	['GR', 'GR123456789'],
	['AT', 'AT12345678'],
	['FR', 'FRIO123456789'],
	['ES', 'ES123456789'],
	['RO', 'RO0123'],
	['SE', 'SE123456789012'],
	['DE', 'DE12345678']
];

describe('buyer vat id', () => {
	it('knows a format for every member state', () => {
		expect(Object.keys(vatIdFormats)).toHaveLength(27);
	});

	it.each(valid)('takes the format of %s: %s', (countryCode, vatId) => {
		expect(buyerVatIdValid(countryCode, vatId)).toBe(true);
		expect(createClientSchema.safeParse({ name: 'Acme', countryCode, vatId }).success).toBe(true);
	});

	it.each(invalid)('refuses for %s: %s', (countryCode, vatId) => {
		expect(buyerVatIdValid(countryCode, vatId)).toBe(false);
		expect(
			createClientSchema.safeParse({ name: 'Acme', countryCode, vatId }).error?.issues
		).toMatchObject([{ message: 'format.vatId', path: ['vatId'], params: { countryCode } }]);
	});

	it('holds a german client to the german format by default', () => {
		expect(
			createClientSchema.safeParse({ name: 'Acme', vatId: 'NL853746291B01' }).error?.issues
		).toMatchObject([{ message: 'format.vatId', params: { countryCode: 'DE' } }]);
	});

	it('takes a third country tax number as it is', () => {
		const swiss = { name: 'Acme AG', countryCode: 'CH', vatId: 'CHE-123.456.789 MWST' };
		expect(createClientSchema.parse(swiss)).toMatchObject(swiss);
		expect(buyerVatIdValid('US', '12-3456789')).toBe(true);
	});
});

describe('leitweg id', () => {
	it.each([
		'04011000-1234512345-06',
		'991-33333TEST-33',
		'04011000-12345-03',
		'05999-STADTWERKE-09'
	])('takes %s with its check digits', (buyerReference) => {
		expect(leitwegIdValid(buyerReference)).toBe(true);
		expect(createClientSchema.parse({ name: 'Stadt Kassel', buyerReference })).toMatchObject({
			buyerReference
		});
	});

	it.each(['04011000-1234512345-07', '04011000-12345-34', '14713000-DIGI01-45', '2026-118-07'])(
		'wants the check digits once %s looks like a leitweg id',
		(buyerReference) => {
			expect(leitwegIdValid(buyerReference)).toBe(false);
			expect(
				createClientSchema.safeParse({ name: 'Stadt Kassel', buyerReference }).error?.issues
			).toMatchObject([{ message: 'format.leitwegId', path: ['buyerReference'] }]);
		}
	);

	it.each([
		'PO-2026-118',
		'Bestellung 4711',
		'4711',
		'14713000-digi01-45',
		'04011000-123-4',
		'Best. 2026-118-07',
		'PO 2026-118-07'
	])(
		'takes the order number %s as free text',
		(buyerReference) => {
			expect(leitwegIdValid(buyerReference)).toBe(false);
			expect(updateClientSchema.parse({ buyerReference })).toEqual({ buyerReference });
		}
	);
});

describe('createProjectEntrySchema', () => {
	it('takes a manual entry with a note', () => {
		expect(createProjectEntrySchema.safeParse(entry).success).toBe(true);
	});

	it.each(['2026-09-24T09:00:00+02:00', '2026-09-24T08:00:00+02:00'])(
		'refuses an end at %s',
		(endedAt) => {
			expect(createProjectEntrySchema.safeParse({ ...entry, endedAt }).error?.issues).toMatchObject(
				[{ message: 'project.endBeforeStart', path: ['endedAt'] }]
			);
		}
	);

	it('has no open manual entries', () => {
		expect(createProjectEntrySchema.safeParse({ ...entry, endedAt: undefined }).success).toBe(
			false
		);
	});

	it('does not take an employee from the body', () => {
		expect(createProjectEntrySchema.safeParse({ ...entry, employeeId: projectId }).success).toBe(
			false
		);
	});
});

describe('updateProjectEntrySchema', () => {
	it('moves an entry to another task', () => {
		expect(updateProjectEntrySchema.parse({ taskId: null })).toEqual({ taskId: null });
	});

	it.each(['employeeId', 'invoiceId', 'source'])('refuses %s', (field) => {
		expect(updateProjectEntrySchema.safeParse({ [field]: projectId }).success).toBe(false);
	});

	it('checks the span only when both ends come along', () => {
		expect(updateProjectEntrySchema.safeParse({ endedAt: entry.startedAt }).success).toBe(true);
		expect(
			updateProjectEntrySchema.safeParse({ startedAt: entry.endedAt, endedAt: entry.startedAt })
				.success
		).toBe(false);
	});
});

describe('centsSchema', () => {
	it.each(['0', '-500', '999999999999999'])('takes %s', (cents) => {
		expect(centsSchema.safeParse(cents).success).toBe(true);
	});

	it.each(['1234567890123456', '12.50', '', ' 500'])('refuses %o', (cents) => {
		expect(centsSchema.safeParse(cents).error?.issues[0]?.message).toBe('format.cents');
	});
});
