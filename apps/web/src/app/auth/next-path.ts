import { z } from 'zod';

// only paths inside the app, a backslash or a stripped tab in /\t/host would let the browser read //host
export const nextPath = z
	.string()
	.regex(/^\/(?![/\\])[^\\\p{Cc}]*$/u)
	.optional()
	.catch(undefined);
