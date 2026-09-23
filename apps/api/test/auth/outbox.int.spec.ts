import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Database } from '../../src/db/database';
import { OutboxTransport } from '../../src/mail/outbox.transport';
import { connectAs, createTenant, databaseUrl } from '../helpers/pg';

let db: Database;

beforeAll(() => {
	db = new Database(databaseUrl('app'));
});

afterAll(() => db.destroy());

// the demo sends its reset and notice mails here, and the outbox is fenced per tenant
describe('OutboxTransport', () => {
	it('files the mail under the tenant it belongs to', async () => {
		const tenantId = await createTenant({ kind: 'sandbox' });
		await new OutboxTransport(db).send({
			tenantId,
			to: 'anna@example.test',
			subject: 'Passwort für DMN Zeit zurücksetzen',
			text: 'Hallo Anna'
		});

		const superuser = await connectAs('superuser');
		const { rows } = await superuser.query(
			'select recipient, subject, body from ops.demo_outbox where tenant_id = $1',
			[tenantId]
		);
		expect(rows).toEqual([
			{
				recipient: 'anna@example.test',
				subject: 'Passwort für DMN Zeit zurücksetzen',
				body: 'Hallo Anna'
			}
		]);
	});
});
