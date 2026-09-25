import { outboxMailSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { expectContract } from '../auth/api';
import { insertId } from '../helpers/pg';
import { openSandbox, startDemo, type Demo } from './sandbox';

let demo: Demo;
let sandboxes: Awaited<ReturnType<typeof openSandbox>>[];
// per sandbox, newest first like the outbox lists them
const mails: string[][] = [[], []];

beforeAll(async () => {
	demo = await startDemo();
	sandboxes = await Promise.all([openSandbox(demo), openSandbox(demo)]);
	for (const subject of ['Urlaubsantrag genehmigt', 'Korrektur übernommen']) {
		for (const [i, { session }] of sandboxes.entries()) {
			const id = await insertId(
				demo.superuser,
				`insert into ops.demo_outbox (tenant_id, recipient, subject, body)
				 values ($1, 'anna.becker@example.test', $2, 'Hallo Anna') returning id`,
				[session.tenant.id, subject]
			);
			mails[i]!.unshift(id);
		}
	}
});

afterAll(() => demo.app.close());

describe('GET /api/demo/outbox', () => {
	it.each([0, 1])('shows sandbox %i its own mails and none of the other', async (i) => {
		const answer = await sandboxes[i]!.visitor.get('/demo/outbox');

		expect(answer.status).toBe(200);
		expectContract(z.array(outboxMailSchema), answer.body);
		expect(answer.body.map((mail: { id: string }) => mail.id)).toEqual(mails[i]);
	});
});
