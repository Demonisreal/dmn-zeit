import { appModes } from '@zeit/shared';
import { z } from 'zod';

const cidr = z.union([z.cidrv4(), z.cidrv6()]);

const proxyRanges = z.string().refine(
	(list) =>
		list
			.split(',')
			.map((range) => range.trim())
			.every((range) => cidr.safeParse(range).success && !/\/0$/.test(range)),
	'Expected comma-separated CIDR ranges like 172.28.2.0/24, /0 is refused'
);

const secret = z
	.base64()
	.refine((text) => Buffer.from(text, 'base64').length === 32, 'Expected 32 bytes as base64');

const liveOnly = ['MAIL_FROM', 'RESEND_API_KEY', 'PASSWORD_PEPPER', 'DATA_ENCRYPTION_KEY'] as const;

const schema = z
	.object({
		APP_MODE: z.enum(appModes),
		APP_ORIGIN: z
			.url({ protocol: /^https?$/ })
			.refine((url) => new URL(url).origin === url, 'Expected an origin without path'),
		PORT: z.coerce.number().int().min(1).max(65535).default(3001),
		DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
		CLI_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
		TRUSTED_PROXY: proxyRanges,
		MAIL_FROM: z.string().optional(),
		RESEND_API_KEY: z.string().optional(),
		PASSWORD_PEPPER: secret.optional(),
		DATA_ENCRYPTION_KEY: secret.optional()
	})
	.superRefine((env, ctx) => {
		if (env.APP_MODE !== 'live') return;
		for (const key of liveOnly) {
			if (!env[key]) {
				ctx.addIssue({ code: 'custom', path: [key], message: 'Required in live mode' });
			}
		}
		if (new URL(env.APP_ORIGIN).protocol !== 'https:') {
			ctx.addIssue({
				code: 'custom',
				path: ['APP_ORIGIN'],
				message: 'Has to be https in live mode'
			});
		}
	})
	.transform(({ PASSWORD_PEPPER, DATA_ENCRYPTION_KEY, ...env }) => ({
		...env,
		PASSWORD_PEPPER: PASSWORD_PEPPER
			? Buffer.from(PASSWORD_PEPPER, 'base64')
			: Buffer.from('dev-only-pepper-never-used-live!'),
		DATA_ENCRYPTION_KEY: DATA_ENCRYPTION_KEY
			? Buffer.from(DATA_ENCRYPTION_KEY, 'base64')
			: Buffer.from('dev-only-key-for-demo-and-tests!')
	}));

export type Config = z.infer<typeof schema>;

export function loadConfig(env: Record<string, unknown>): Config {
	const given = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
	const parsed = schema.safeParse(given);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
		throw new Error(`Invalid configuration: ${issues.join('; ')}`);
	}
	return parsed.data;
}
