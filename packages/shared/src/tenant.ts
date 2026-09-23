import { z } from 'zod';
import {
	capMinutesSchema,
	instantSchema,
	isoDateSchema,
	portionSchema,
	queryYearSchema,
	uuidSchema
} from './common';

export const federalStates = [
	'BW',
	'BY',
	'BE',
	'BB',
	'HB',
	'HH',
	'HE',
	'MV',
	'NI',
	'NW',
	'RP',
	'SL',
	'SN',
	'ST',
	'SH',
	'TH'
] as const;
export type FederalState = (typeof federalStates)[number];

export const holidayCodes = [
	'new_year',
	'epiphany',
	'womens_day',
	'good_friday',
	'easter_sunday',
	'easter_monday',
	'labour_day',
	'liberation_day',
	'ascension_day',
	'whit_sunday',
	'whit_monday',
	'corpus_christi',
	'augsburg_peace',
	'assumption_day',
	'world_childrens_day',
	'german_unity_day',
	'reformation_day',
	'all_saints_day',
	'repentance_day',
	'christmas_eve',
	'christmas_day',
	'boxing_day',
	'new_years_eve'
] as const;
export type HolidayCode = (typeof holidayCodes)[number];

// opt-in for holidays kept only locally: corpus christi in SN/TH, assumption day in BY, augsburg
export const optionalHolidays = ['corpus_christi', 'augsburg_peace', 'assumption_day'] as const;
export type OptionalHoliday = (typeof optionalHolidays)[number];

export const flexCapModes = ['none', 'forfeit_at_close', 'warn'] as const;
export type FlexCapMode = (typeof flexCapModes)[number];

export const tenantKinds = ['live', 'sandbox'] as const;
export type TenantKind = (typeof tenantKinds)[number];

// same check as the db: only days every year has, so no 02-29
const monthDaySchema = z
	.string()
	.regex(
		/^((0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-8])|(0[13-9]|1[0-2])-(29|30)|(0[13578]|1[02])-31)$/,
		'format.monthDay'
	);

export const tenantSchema = z.object({
	id: uuidSchema,
	name: z.string(),
	slug: z.string(),
	state: z.enum(federalStates),
	timezone: z.literal('Europe/Berlin'),
	holidayOptions: z.array(z.enum(optionalHolidays)),
	halfDaysDec24And31: z.boolean(),
	flexCapPlusMinutes: z.int().nullable(),
	flexCapMinusMinutes: z.int().nullable(),
	flexCapMode: z.enum(flexCapModes),
	carryoverUntil: monthDaySchema,
	kind: z.enum(tenantKinds),
	expiresAt: instantSchema.nullable()
});

export const updateTenantSchema = z
	.object({
		name: z.string().trim().min(1).max(120),
		state: z.enum(federalStates),
		holidayOptions: z.array(z.enum(optionalHolidays)).max(optionalHolidays.length),
		halfDaysDec24And31: z.boolean(),
		flexCapPlusMinutes: capMinutesSchema.nullable(),
		flexCapMinusMinutes: capMinutesSchema.nullable(),
		flexCapMode: z.enum(flexCapModes),
		carryoverUntil: monthDaySchema
	})
	.partial();

export const holidaySchema = z.object({
	date: isoDateSchema,
	code: z.enum(holidayCodes),
	portion: portionSchema
});

export const holidaysQuerySchema = z.object({ year: queryYearSchema });

export type Tenant = z.infer<typeof tenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type Holiday = z.infer<typeof holidaySchema>;
export type HolidaysQuery = z.infer<typeof holidaysQuerySchema>;
