import { z } from 'zod';

export const nextPath = z
	.string()
	.regex(/^\/(?![/\\])[^\\\p{Cc}]*$/u)
	.optional()
	.catch(undefined);
