import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');
const composeFile = path.join(repoRoot, 'compose.test.yml');

function run(args: string[], input?: string) {
	const result = spawnSync('docker', args, {
		cwd: repoRoot,
		input,
		encoding: 'utf8'
	});
	if (result.status !== 0) {
		throw new Error(
			`docker ${args.join(' ')} failed (${result.status}):\n${result.stderr || result.stdout}`
		);
	}
	return result.stdout;
}

// the cli only ever runs inside the api image, compose.test.yml gives it no owner credentials of its own
export function tenantCreate(args: string[]): string {
	const dbUrl = 'postgres://zeit_owner:zeit_owner@zeit-test-db:5432/zeit?sslmode=disable';
	return run([
		'compose',
		'-f',
		composeFile,
		'exec',
		'-e',
		`CLI_DATABASE_URL=${dbUrl}`,
		'zeit-test-api',
		'node',
		'dist/cli.js',
		'tenant:create',
		...args
	]);
}

// direct writes as the table owner, for the handful of facts no endpoint produces (see docs/planung.md
// "Tests"): a fresh employee's leave entitlement, which otherwise only the january cron job books, and
// invitation tokens, whose plaintext a real mail transport would carry away in every mode but test
export function seedSql(statements: string): void {
	run(
		[
			'compose',
			'-f',
			composeFile,
			'exec',
			'-T',
			'zeit-test-db',
			'psql',
			'-v',
			'ON_ERROR_STOP=1',
			'-U',
			'zeit_owner',
			'-d',
			'zeit'
		],
		`set role zeit_system;\n${statements}`
	);
}
