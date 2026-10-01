import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectAs, createTenant, insertId } from '../helpers/pg';

let superuser: pg.Client;
let app: pg.Client;
let tenant: string;

beforeAll(async () => {
	superuser = await connectAs('superuser');
	app = await connectAs('app');
	tenant = await createTenant();
});

function logged(ip: string, age: string) {
	return insertId(
		superuser,
		`insert into audit.log (tenant_id, occurred_at, source, action, ip)
		 values ($1, now() - $3::interval, 'app', 'login.failed', $2) returning id`,
		[tenant, ip, age]
	);
}

async function ipOf(id: string) {
	const { rows } = await superuser.query('select ip from audit.log where id = $1', [id]);
	return rows[0].ip;
}

describe('ops.audit_ip_retention', () => {
	it('cuts addresses older than 30 days down to /24 and /48 and leaves newer ones', async () => {
		const v4 = await logged('203.0.113.77', '31 days');
		const v6 = await logged('2001:db8:1234:5678::1', '40 days');
		const fresh = await logged('198.51.100.9', '29 days');

		const run = () => app.query('select ops.audit_ip_retention() as cut');
		expect((await run()).rows[0].cut).toBe(2);
		expect(await ipOf(v4)).toBe('203.0.113.0/24');
		expect(await ipOf(v6)).toBe('2001:db8:1234::/48');
		expect(await ipOf(fresh)).toBe('198.51.100.9');
		expect((await run()).rows[0].cut).toBe(0);
	});

	it('allows no other change to the trail, not even of the address', async () => {
		const id = await logged('192.0.2.44', '1 day');
		for (const change of [
			`ip = '192.0.2.0/25'`,
			`ip = '198.51.100.0/24'`,
			`ip = '192.0.2.0/24', action = 'login.succeeded'`,
			`ip = null`
		]) {
			await expect(
				superuser.query(`update audit.log set ${change} where id = $1`, [id])
			).rejects.toMatchObject({ code: 'ZT002' });
		}
		expect(await ipOf(id)).toBe('192.0.2.44');

		await expect(
			app.query(`update audit.log set ip = '192.0.2.0/24' where id = $1`, [id])
		).rejects.toMatchObject({ code: '42501' });
	});
});
