import { z } from 'zod';

// only paths inside the app, a backslash would let the browser read it as //host
export const nextPath = z
	.string()
	.regex(/^\/(?![/\\])[^\\]*$/)
	.optional()
	.catch(undefined);
