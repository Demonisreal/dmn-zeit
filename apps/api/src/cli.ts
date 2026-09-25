import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { displayNameSchema, emailSchema, federalStates } from '@zeit/shared';
import { DatabaseError } from 'pg';
import { z } from 'zod';
import { createTenant } from './cli/tenant-create';
import { loadConfig } from './config';
import { Database } from './db/database';

const usage =
	'Usage: node dist/cli.js tenant:create --name <name> --slug <slug> --state <NW> --admin-email <email> --admin-name <name>';

const tenantArgs = z.object({
	name: z.string().trim().min(1).max(120),
	slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, digits and dashes'),
	state: z.enum(federalStates),
	'admin-email': emailSchema,
	'admin-name': displayNameSchema
});

function fail(message: string) {
	console.error(message);
	process.exitCode = 1;
}

async function main() {
	const [command, ...rest] = process.argv.slice(2);
	if (command !== 'tenant:create') return fail(usage);

	const { values } = parseArgs({
		args: rest,
		options: {
			name: { type: 'string' },
			slug: { type: 'string' },
			state: { type: 'string' },
			'admin-email': { type: 'string' },
			'admin-name': { type: 'string' }
		}
	});
	const parsed = tenantArgs.safeParse(values);
	if (!parsed.success) {
		const issues = parsed.error.issues.map(
			(issue) => `--${issue.path.join('.')}: ${issue.message}`
		);
		return fail([...issues, usage].join('\n'));
	}

	// the .env of the repo root in development, the container brings its env along
	const envFile = join(__dirname, '..', '..', '..', '.env');
	if (existsSync(envFile)) process.loadEnvFile(envFile);
	const config = loadConfig(process.env);
	if (!config.CLI_DATABASE_URL) {
		return fail('CLI_DATABASE_URL is not set, tenant:create connects as zeit_owner, not zeit_app');
	}

	const args = parsed.data;
	const db = new Database(config.CLI_DATABASE_URL);
	try {
		const link = await createTenant(
			db,
			{
				name: args.name,
				slug: args.slug,
				state: args.state,
				adminEmail: args['admin-email'],
				adminName: args['admin-name']
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
	} finally {
		await db.destroy();
	}
}

void main();
