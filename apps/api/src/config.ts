import { appModes } from '@zeit/shared';
import { z } from 'zod';

const schema = z.object({
	APP_MODE: z.enum(appModes),
	// compared verbatim with the Origin header of every write
	APP_ORIGIN: z
		.url({ protocol: /^https?$/ })
		.refine((url) => new URL(url).origin === url, 'Expected an origin without path'),
	PORT: z.coerce.number().int().min(1).max(65535).default(3001),
	// runs as zeit_app, the owner url is only for dbmate
	DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
	TRUSTED_PROXY: z.string().min(1),
	MAIL_FROM: z.string().optional(),
	RESEND_API_KEY: z.string().optional()
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: Record<string, unknown>): Config {
	// KEY= in .env means unset, not an empty value
	const set = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
	const parsed = schema.safeParse(set);
	if (!parsed.success) {
		const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
		throw new Error(`Incomplete configuration: ${missing}`);
	}

	const config = parsed.data;
	if (config.APP_MODE === 'live' && (!config.MAIL_FROM || !config.RESEND_API_KEY)) {
		throw new Error('APP_MODE=live, but MAIL_FROM or RESEND_API_KEY is missing');
	}

	return config;
}
