import { describe, expect, it } from 'vitest';
import { centsSchema } from './common';
import {
	createClientSchema,
	createProjectEntrySchema,
	updateClientSchema,
	updateProjectEntrySchema
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
