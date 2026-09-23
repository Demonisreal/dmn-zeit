import { z } from 'zod';
import { instantSchema, isoDateSchema, uuidSchema } from './common';

const today = {
	workday: isoDateSchema,
	workedMinutes: z.int().min(0)
};

export const clockSchema = z.discriminatedUnion('state', [
	z.object({ state: z.literal('off'), ...today }),
	z.object({ state: z.literal('working'), ...today, entryId: uuidSchema, since: instantSchema }),
	z.object({ state: z.literal('on_break'), ...today, since: instantSchema })
]);

export type Clock = z.infer<typeof clockSchema>;
export type ClockState = Clock['state'];
