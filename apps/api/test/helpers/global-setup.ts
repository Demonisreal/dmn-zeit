import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

export type Server = {
	host: string;
	port: number;
	template: string;
	passwords: { superuser: string; owner: string; app: string };
};

declare module 'vitest' {
	export interface ProvidedContext {
		pg: Server;
	}
}

const dbDir = new URL('../../../../db/', import.meta.url);
const passwords = { superuser: 'postgres', owner: 'zeit_owner', app: 'zeit_app' };

// same image and init script as compose.dev.yml, then the up halves the way dbmate runs them
export default async function setup(project: TestProject) {
	const container = await new PostgreSqlContainer('postgres:17-alpine')
		.withDatabase('zeit')
		.withUsername('postgres')
		.withPassword(passwords.superuser)
		.withEnvironment({
			ZEIT_OWNER_PASSWORD: passwords.owner,
			ZEIT_APP_PASSWORD: passwords.app
		})
		.withCopyFilesToContainer([
			{
				source: fileURLToPath(new URL('init/00-roles.sh', dbDir)),
				target: '/docker-entrypoint-initdb.d/00-roles.sh',
				mode: 0o755
			}
		])
		.start();

	const server: Server = {
		host: container.getHost(),
		port: container.getPort(),
		template: 'zeit',
		passwords
	};

	const owner = new pg.Client({
		...connection(server),
		user: 'zeit_owner',
		password: passwords.owner
	});
	await owner.connect();
	const migrations = new URL('migrations/', dbDir);
	for (const file of (await readdir(migrations)).filter((f) => f.endsWith('.sql')).sort()) {
		const [up] = (await readFile(new URL(file, migrations), 'utf8')).split('-- migrate:down');
		await owner.query('begin');
		await owner.query(up!);
		await owner.query('commit');
	}
	await owner.end();

	// every test file clones this one, and a clone fails while anyone is still connected
	const superuser = new pg.Client({ ...connection(server), database: 'postgres' });
	await superuser.connect();
	await superuser.query('alter database zeit with is_template true allow_connections false');
	await superuser.end();

	project.provide('pg', server);
	return () => container.stop();
}

function connection(server: Server) {
	return {
		host: server.host,
		port: server.port,
		user: 'postgres',
		password: server.passwords.superuser,
		database: server.template
	};
}
