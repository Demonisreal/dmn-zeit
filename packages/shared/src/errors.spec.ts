import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import { absencesQuerySchema, createAbsenceSchema } from './absences';
import { tokenSchema } from './auth';
import {
	centsSchema,
	dayCountSchema,
	displayNameSchema,
	isoDateSchema,
	monthSchema,
	noteSchema
} from './common';
import { createCorrectionSchema } from './corrections';
import { apiErrorSchema, validationKeys, type ValidationKey } from './errors';
import { createFlexBookingSchema } from './flex';
import { createContractSchema, teamLeadsSchema } from './org';
import { createProjectEntrySchema } from './projects';
import { recoveryCodeSchema, totpCodeSchema } from './security';
import { updateTenantSchema } from './tenant';
import { daysQuerySchema } from './time';
import { createVacationAdjustmentSchema } from './vacation';

describe('apiErrorSchema', () => {
	it('carries field issues for validation errors', () => {
		const parsed = apiErrorSchema.parse({
			code: 'VALIDATION',
			message: 'Invalid input',
			details: [
				{ field: 'reason', code: 'too_small', message: 'Too small', params: { minimum: 10 } },
				{ field: 'halfDayEnd', code: 'custom', message: 'absence.halfDaySingle' }
			]
		});
		expect(parsed.code).toBe('VALIDATION');
	});

	it('rejects a validation error without issues', () => {
		const parsed = apiErrorSchema.safeParse({
			code: 'VALIDATION',
			message: 'Invalid input',
			details: null
		});
		expect(parsed.success).toBe(false);
	});

	it('takes an object or null as details for everything else', () => {
		expect(
			apiErrorSchema.safeParse({
				code: 'TIME_OVERLAP',
				message: 'Overlaps an existing entry',
				details: { entryId: '7f1c0a52-3b7e-4d0c-9a51-2f8e6b1d4c3a' }
			}).success
		).toBe(true);
		expect(
			apiErrorSchema.safeParse({ code: 'REAUTH_REQUIRED', message: 'Confirm again', details: null })
				.success
		).toBe(true);
	});

	it('does not know made up codes', () => {
		expect(
			apiErrorSchema.safeParse({ code: 'TEAPOT', message: 'Short and stout', details: null })
				.success
		).toBe(false);
	});
});

const employeeId = '5c3e2d1a-0f9b-4a8c-b7d6-e5f4a3b2c1d0';
const entryId = '0b8a6c2e-5d4f-4e3a-8b1c-9d7e6f5a4b3c';
const reason = 'Gehen vergessen, war um 17 Uhr weg';

const failures: [ValidationKey, ZodType, unknown][] = [
	['format.date', isoDateSchema, '0000-01-01'],
	['format.month', monthSchema, '2026-13'],
	['format.monthDay', updateTenantSchema, { carryoverUntil: '02-29' }],
	['format.dayCount', dayCountSchema, '1.5'],
	['format.cents', centsSchema, '12.50'],
	[
		'format.entitlement',
		createContractSchema,
		{ validFrom: '2026-01-01', workModelId: entryId, vacationDaysYear: '30.25' }
	],
	['format.token', tokenSchema, 'short'],
	['format.totp', totpCodeSchema, '12345'],
	['format.recoveryCode', recoveryCodeSchema, 'ABCDE-FGH10'],
	['text.empty', noteSchema, '   '],
	['text.controlChars', displayNameSchema, 'Anna\tBerg'],
	['range.required', absencesQuerySchema, { scope: 'all' }],
	['range.unordered', daysQuerySchema, { from: '2026-10-04', to: '2026-09-28' }],
	['range.tooLong', daysQuerySchema, { from: '2026-01-01', to: '2026-12-31' }],
	[
		'absence.endBeforeStart',
		createAbsenceSchema,
		{ employeeId, type: 'vacation', startDate: '2026-12-21', endDate: '2026-12-20' }
	],
	[
		'absence.halfDaySingle',
		createAbsenceSchema,
		{
			employeeId,
			type: 'vacation',
			startDate: '2026-12-21',
			endDate: '2026-12-21',
			halfDayStart: true,
			halfDayEnd: true
		}
	],
	[
		'correction.endBeforeStart',
		createCorrectionSchema,
		{
			action: 'change',
			entryId,
			startedAt: '2026-09-24T17:00:00+02:00',
			endedAt: '2026-09-24T08:00:00+02:00',
			reason
		}
	],
	[
		'flex.zeroMinutes',
		createFlexBookingSchema,
		{ type: 'manual', minutes: 0, effectiveDate: '2026-09-30', reason }
	],
	[
		'flex.payoutPositive',
		createFlexBookingSchema,
		{ type: 'payout', minutes: 60, effectiveDate: '2026-09-30', reason }
	],
	[
		'vacation.zeroDays',
		createVacationAdjustmentSchema,
		{ bucketYear: 2026, days: '0.00', effectiveDate: '2026-09-30', reason }
	],
	['team.duplicateLead', teamLeadsSchema, { userIds: [entryId, entryId] }],
	[
		'project.endBeforeStart',
		createProjectEntrySchema,
		{
			projectId: entryId,
			startedAt: '2026-09-24T12:00:00+02:00',
			endedAt: '2026-09-24T09:00:00+02:00',
			note: 'Abstimmung Angebot'
		}
	],
	[
		'project.noteRequired',
		createProjectEntrySchema,
		{
			projectId: entryId,
			startedAt: '2026-09-24T09:00:00+02:00',
			endedAt: '2026-09-24T12:00:00+02:00'
		}
	]
];

// password.common after the list of common passwords, rate.futureOnly against the tenant's today
const raisedByApi: ValidationKey[] = ['password.common', 'rate.futureOnly'];

describe('validation keys', () => {
	it.each(failures)('%s comes out of the schema', (key, schema, input) => {
		const parsed = schema.safeParse(input);
		expect(parsed.error?.issues.map((issue) => issue.message)).toContain(key);
	});

	it('lists every key the schemas produce, and no others', () => {
		const produced = [...failures.map(([key]) => key), ...raisedByApi];
		expect([...produced].sort()).toEqual([...validationKeys].sort());
	});
});
