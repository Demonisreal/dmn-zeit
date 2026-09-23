import { z } from 'zod';
import {
	instantSchema,
	isoDateSchema,
	monthSchema,
	queryYearSchema,
	reasonSchema,
	userRefSchema,
	uuidSchema
} from './common';
import { flexCapModes } from './tenant';

export const flexBookingTypes = ['opening', 'manual', 'payout', 'cap_forfeit'] as const;
export type FlexBookingType = (typeof flexBookingTypes)[number];

export const flexBookingSchema = z.object({
	id: uuidSchema,
	employeeId: uuidSchema,
	type: z.enum(flexBookingTypes),
	minutes: z.int(),
	effectiveDate: isoDateSchema,
	reason: z.string(),
	monthClosingId: uuidSchema.nullable(),
	createdBy: userRefSchema.nullable(),
	createdAt: instantSchema
});

// cap_forfeit is only ever booked by the month closing
export const createFlexBookingSchema = z
	.object({
		type: z.enum(flexBookingTypes).exclude(['cap_forfeit']),
		minutes: z
			.int()
			.min(-60000)
			.max(60000)
			.refine((minutes) => minutes !== 0, 'flex.zeroMinutes'),
		effectiveDate: isoDateSchema,
		reason: reasonSchema
	})
	.refine((booking) => booking.type !== 'payout' || booking.minutes < 0, {
		error: 'flex.payoutPositive',
		path: ['minutes']
	});

export const flexMonthSchema = z.object({
	month: monthSchema,
	targetMinutes: z.int().min(0),
	workedMinutes: z.int().min(0),
	creditedMinutes: z.int().min(0),
	bookedMinutes: z.int(),
	diffMinutes: z.int(),
	balanceMinutes: z.int(),
	closed: z.boolean()
});

export const flexAccountSchema = z.object({
	employeeId: uuidSchema,
	year: z.int(),
	openingMinutes: z.int(),
	balanceMinutes: z.int(),
	// the day the balance is counted through, today for the running year
	asOf: isoDateSchema,
	cap: z.object({
		plusMinutes: z.int().nullable(),
		minusMinutes: z.int().nullable(),
		mode: z.enum(flexCapModes)
	}),
	months: z.array(flexMonthSchema),
	bookings: z.array(flexBookingSchema)
});

export const flexQuerySchema = z.object({ year: queryYearSchema });

export type FlexBooking = z.infer<typeof flexBookingSchema>;
export type CreateFlexBookingInput = z.infer<typeof createFlexBookingSchema>;
export type FlexMonth = z.infer<typeof flexMonthSchema>;
export type FlexAccount = z.infer<typeof flexAccountSchema>;
export type FlexQuery = z.infer<typeof flexQuerySchema>;
