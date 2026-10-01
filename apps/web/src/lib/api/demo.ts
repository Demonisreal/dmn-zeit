import { queryOptions } from '@tanstack/react-query';
import {
	outboxMailSchema,
	personaSchema,
	publicConfigSchema,
	sessionSchema,
	type CreateSandboxInput,
	type SwitchPersonaInput
} from '@zeit/shared';
import { z } from 'zod';
import { request } from './client';

export const configQuery = queryOptions({
	queryKey: ['config'],
	queryFn: () => request('/config', { schema: publicConfigSchema }),
	staleTime: Infinity
});

export const createSandbox = (input: CreateSandboxInput) =>
	request('/demo/sandboxes', { method: 'POST', body: input, schema: sessionSchema });

export const personasQuery = queryOptions({
	queryKey: ['demo', 'personas'],
	queryFn: () => request('/demo/personas', { schema: z.array(personaSchema) })
});

export const switchPersona = (input: SwitchPersonaInput) =>
	request('/demo/switch', { method: 'POST', body: input });

export const outboxQuery = queryOptions({
	queryKey: ['demo', 'outbox'],
	queryFn: () => request('/demo/outbox', { schema: z.array(outboxMailSchema) })
});
