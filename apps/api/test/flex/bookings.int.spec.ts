import { randomUUID } from 'node:crypto';
import { flexBookingSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeMonth, office, type Office } from '../absences/office';
import { expectContract, startApi, type Api } from '../auth/api';

let api: Api;
let o: Office;

beforeAll(async () => {
	api = await startApi();
	o = await office(api);
});

afterAll(() => api.app.close());

const booking = {
	type: 'manual',
	minutes: 90,
	effectiveDate: '2026-03-02',
	reason: 'Überstunden aus dem Projekt nachgetragen'
};
const path = (employeeId: string) => `/employees/${employeeId}/flex/bookings`;

describe('POST /api/employees/:id/flex/bookings', () => {
	it('books minutes with reason and author', async () => {
		const answer = await o.hr.desk.post(path(o.worker.employeeId), booking);

		expect(answer.status).toBe(201);
		expectContract(flexBookingSchema, answer.body);
		expect(answer.body).toMatchObject({
			employeeId: o.worker.employeeId,
			type: 'manual',
			minutes: 90,
			effectiveDate: '2026-03-02',
			monthClosingId: null,
			createdBy: { id: o.hr.userId, displayName: 'Hanna Personal' }
		});
		const { rows } = await api.superuser.query(
			'select count(*)::int as n from app.flex_bookings where employee_id = $1',
			[o.worker.employeeId]
		);
		expect(rows[0].n).toBe(1);
	});

	it('pays out only negative minutes and never books a cap', async () => {
		const payout = { ...booking, type: 'payout' };
		const positive = await o.hr.desk.post(path(o.worker.employeeId), payout);
		expect(positive.status).toBe(400);
		expect(positive.body.details[0]).toMatchObject({ message: 'flex.payoutPositive' });
		expect(
			(await o.hr.desk.post(path(o.worker.employeeId), { ...payout, minutes: -600 })).status
		).toBe(201);

		const cap = await o.hr.desk.post(path(o.worker.employeeId), {
			...booking,
			type: 'cap_forfeit'
		});
		expect(cap.status).toBe(400);
		const zero = await o.hr.desk.post(path(o.worker.employeeId), { ...booking, minutes: 0 });
		expect(zero.body.details[0]).toMatchObject({ message: 'flex.zeroMinutes' });
		const short = await o.hr.desk.post(path(o.worker.employeeId), { ...booking, reason: 'weil' });
		expect(short.status).toBe(400);
	});

	it('is for hr alone, and not on the own account', async () => {
		expect((await o.worker.desk.post(path(o.worker.employeeId), booking)).status).toBe(403);
		expect((await o.lead.desk.post(path(o.worker.employeeId), booking)).status).toBe(403);
		const own = await o.hr.desk.post(path(o.hr.employeeId), booking);
		expect(own.status).toBe(403);
		expect(own.body.code).toBe('FORBIDDEN');
	});

	it('knows only people of the own tenant', async () => {
		expect((await o.hr.desk.post(path(randomUUID()), booking)).status).toBe(404);
		const elsewhere = await office(api);
		expect((await elsewhere.hr.desk.post(path(o.worker.employeeId), booking)).status).toBe(404);
	});

	it('refuses a booking inside a closed month', async () => {
		const locked = await office(api);
		await closeMonth(api, locked.tenantId, '2026-01-01', locked.hr.userId);
		const answer = await locked.hr.desk.post(path(locked.worker.employeeId), {
			...booking,
			effectiveDate: '2026-01-15'
		});
		expect(answer.status).toBe(409);
		expect(answer.body.code).toBe('PERIOD_LOCKED');
	});
});
