import { z } from 'zod';

export const appModes = ['demo', 'live', 'test'] as const;
export type AppMode = (typeof appModes)[number];

export const healthSchema = z.object({ status: z.literal('ok') });
export const publicConfigSchema = z.object({ mode: z.enum(appModes) });

export type Health = z.infer<typeof healthSchema>;
export type PublicConfig = z.infer<typeof publicConfigSchema>;
