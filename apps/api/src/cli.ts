import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';
import {
	displayNameSchema,
	emailSchema,
	federalStates,
	uuidSchema,
	workspaceKinds
} from '@zeit/shared';
import { DatabaseError } from 'pg';
import { z } from 'zod';
import { mailReset, resetLink, resetMfa } from './cli/mfa-reset';
import { archiveTenant } from './cli/tenant-archive';
import { createTenant } from './cli/tenant-create';
import { loadConfig, type Config } from './config';
import { Database } from './db/database';

const usage = [
	'Usage: node dist/cli.js tenant:create --name <name> --slug <slug> --state <NW> --admin-email <email> --admin-name <name>',
	'       node dist/cli.js tenant:create --workspace solo --name <name> --slug <slug> --state <NW> --admin-email <email> --first-name <name> --last-name <name> [--admin-name <name>]',
	'       node dist/cli.js user:mfa-reset --email <email>',
	'       node dist/cli.js tenant:archive --id <uuid>'
].join('\n');

const tenantArgs = z
	.object({
		name: z.string().trim().min(1).max(120),
		slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, digits and dashes'),
		state: z.enum(federalStates),
		workspace: z.enum(workspaceKinds).default('company'),
		'admin-email': emailSchema,
		'admin-name': displayNameSchema.optional(),
		'first-name': displayNameSchema.optional(),
		'last-name': displayNameSchema.optional()
	})
	.superRefine((args, ctx) => {
		// a solo workspace falls back to the name of its person for the admin
		const required =
			args.workspace === 'solo'
				? (['first-name', 'last-name'] as const)
				: (['admin-name'] as const);
		for (const key of required) {
			if (!args[key]) {
				ctx.addIssue({
					code: 'custom',
					path: [key],
					message: `Required for --workspace ${args.workspace}`
				});
			}
		}
	});

function fail(message: string) {
	console.error(message);
	process.exitCode = 1;
}

function parse<T extends z.ZodType>(schema: T, args: string[], options: ParseArgsOptionsConfig) {
	const { values } = parseArgs({ args, options });
	const parsed = schema.safeParse(values);
	if (parsed.success) return parsed.data;

	const issues = parsed.error.issues.map((issue) => `--${issue.path.join('.')}: ${issue.message}`);
	fail([...issues, usage].join('\n'));
}

async function asOwner(command: string, work: (db: Database, config: Config) => Promise<void>) {
	// the .env of the repo root in development, the container brings its env along
	const envFile = join(__dirname, '..', '..', '..', '.env');
	if (existsSync(envFile)) process.loadEnvFile(envFile);
	const config = loadConfig(process.env);
	if (!config.CLI_DATABASE_URL) {
		return fail(`CLI_DATABASE_URL is not set, ${command} connects as zeit_owner, not zeit_app`);
	}

	const db = new Database(config.CLI_DATABASE_URL);
	try {
		await work(db, config);
	} finally {
		await db.destroy();
	}
}

async function tenantCreate(rest: string[]) {
	const args = parse(tenantArgs, rest, {
		name: { type: 'string' },
		slug: { type: 'string' },
		state: { type: 'string' },
		workspace: { type: 'string' },
		'admin-email': { type: 'string' },
		'admin-name': { type: 'string' },
		'first-name': { type: 'string' },
		'last-name': { type: 'string' }
	});
	if (!args) return;

	await asOwner('tenant:create', async (db, config) => {
		try {
			const link = await createTenant(
				db,
				{
					name: args.name,
					slug: args.slug,
					state: args.state,
					adminEmail: args['admin-email'],
					adminName: args['admin-name'] ?? `${args['first-name']} ${args['last-name']}`,
					workspace: args.workspace,
					firstName: args['first-name'],
					lastName: args['last-name']
				},
				config.APP_ORIGIN
			);
			console.log(
				`Tenant ${args.slug} created. Invitation for ${args['admin-email']}, valid for 7 days:`
			);
			console.log(link);
		} catch (error) {
			// slug or email taken, the constraint name in the message tells which
			if (error instanceof DatabaseError && error.code === '23505') return fail(error.message);
			throw error;
		}
	});
}

async function mfaReset(rest: string[]) {
	const args = parse(z.object({ email: emailSchema }), rest, { email: { type: 'string' } });
	if (!args) return;

	await asOwner('user:mfa-reset', async (db, config) => {
		const person = await resetMfa(db, args.email);
		if (!person) return fail('No user with that email');

		const link = await resetLink(db, person, config.APP_ORIGIN);
		console.log(`Second factors and password of ${person.email} removed, all sessions ended.`);
		const handOver = `Hand the person this link, valid for 30 minutes:\n${link}`;
		try {
			if (await mailReset(config, person, link)) console.log('Notice with the reset link mailed.');
			else console.log(`APP_MODE is ${config.APP_MODE}, no mail sent. ${handOver}`);
		} catch (error) {
			// the reset is committed at this point, only the notice went missing
			fail(`Notice not mailed (${(error as Error).message}). ${handOver}`);
		}
	});
}

async function tenantArchive(rest: string[]) {
	const args = parse(z.object({ id: uuidSchema }), rest, { id: { type: 'string' } });
	if (!args) return;

	await asOwner('tenant:archive', async (db) => {
		await archiveTenant(db, args.id);
		console.log(`Tenant ${args.id} archived, users disabled, no data deleted.`);
	});
}

async function main() {
	const [command, ...rest] = process.argv.slice(2);
	switch (command) {
		case 'tenant:create':
			return tenantCreate(rest);
		case 'user:mfa-reset':
			return mfaReset(rest);
		case 'tenant:archive':
			return tenantArchive(rest);
		default:
			return fail(usage);
	}
}

void main();
