import { HttpException, Logger, NotFoundException } from '@nestjs/common';
import { generateDemo, type DemoPlan } from '@zeit/demo-data';
import { apiErrorSchema } from '@zeit/shared';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionService } from '../auth/session.service';
import { csrfTokenFor, hashToken } from '../auth/tokens';
import type { Clock } from '../common/clock';
import { toApiError } from '../common/exception.filter';
import type { AuthSession } from '../common/session.guard';
import type { Database } from '../db/database';
import { DemoService, MAX_SANDBOXES } from './demo.service';
import type { Attempt, DemoStore } from './demo.store';

vi.mock('@zeit/demo-data', () => ({ generateDemo: vi.fn() }));

// just enough of a plan to find the persona on shift: a lead gone home, yesterday's forgotten leave
function planFor(today: string, tenantId: string): DemoPlan {
	return {
		tenant: { id: tenantId },
		entries: [
			{
				employeeId: 'e-lead',
				startedAt: `${today}T07:58:12+02:00`,
				endedAt: `${today}T15:40:00+02:00`
			},
			{ employeeId: 'e-forgot', startedAt: '2026-09-24T12:16:00+02:00', endedAt: null },
			{ employeeId: 'e-worker', startedAt: `${today}T08:14:31+02:00`, endedAt: null }
		],
		users: [
			{ id: 'u-lead', employeeId: 'e-lead' },
			{ id: 'u-forgot', employeeId: 'e-forgot' },
			{ id: 'u-worker', employeeId: 'e-worker' },
			{ id: 'u-admin', employeeId: null }
		],
		projectEntries: [
			{ employeeId: 'e-forgot', startedAt: '2026-09-24T16:40:00+02:00', endedAt: null },
			{ employeeId: 'e-worker', startedAt: `${today}T08:18:31+02:00`, endedAt: null }
		],
		solo: {
			projectEntries: [
				{ employeeId: 'e-solo', startedAt: `${today}T08:34:02+02:00`, endedAt: null }
			]
		}
	} as unknown as DemoPlan;
}

const calm: Attempt[] = [
	{ window: 'hour', hits: 1, retryAfter: 3600 },
	{ window: 'day', hits: 1, retryAfter: 50_000 }
];

const client = { requestId: 'r1', ip: '203.0.113.7', userAgent: 'Firefox' };

const startOf = (plan: DemoPlan, employeeId: string) =>
	plan.entries.find((entry) => entry.employeeId === employeeId)!.startedAt;

const timerOf = (plan: DemoPlan, employeeId: string) =>
	[...plan.projectEntries, ...plan.solo.projectEntries].find(
		(entry) => entry.employeeId === employeeId
	)!.startedAt;

function setup() {
	let plans = 0;
	vi.mocked(generateDemo).mockImplementation(({ today }) =>
		planFor(today.toString(), `tenant-${++plans}`)
	);
	const store = {
		activeSandboxes: vi.fn(async () => 12),
		countAttempt: vi.fn(async (_address: string) => calm),
		write: vi.fn(async (_plan: DemoPlan, _locale: string) => {}),
		personas: vi.fn(async () => []),
		switchPersona: vi.fn(async () => true),
		outbox: vi.fn(async () => [])
	};
	const db = { withTenant: vi.fn((_ctx: unknown, work: (trx: string) => unknown) => work('trx')) };
	const sessions = {
		cookieName: '__Host-zeit_sid',
		open: vi.fn(async () => ({ csrfToken: 'opened' })),
		setCookie: vi.fn((_response: Response, _token: string) => {}),
		resolve: vi.fn(async () => ({ id: 's2' })),
		current: vi.fn(async () => ({ csrfToken: 'switched' }))
	};
	const clock = { now: vi.fn(() => new Date('2026-09-25T08:30:00Z')) };
	const demo = new DemoService(
		db as unknown as Database,
		store as unknown as DemoStore,
		sessions as unknown as SessionService,
		clock as unknown as Clock
	);
	const response = { setHeader: vi.fn() };
	const asResponse = response as unknown as Response;
	return { demo, store, db, sessions, clock, response, asResponse };
}

async function refusal(attempt: Promise<unknown>) {
	const error = await attempt.catch((caught: unknown) => caught);
	expect(error).toBeInstanceOf(HttpException);
	return toApiError(error)!;
}

// the next plan is built in a setImmediate, the tests decide when that happens
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['setImmediate'] });
	vi.mocked(generateDemo).mockReset();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('DemoService.create', () => {
	it(`lets a sandbox in while ${MAX_SANDBOXES - 1} are running`, async () => {
		const { demo, store, asResponse } = setup();
		store.activeSandboxes.mockResolvedValue(MAX_SANDBOXES - 1);

		await expect(demo.create({ locale: 'de' }, client, asResponse)).resolves.toBeDefined();
		expect(store.write).toHaveBeenCalledOnce();
	});

	it(`refuses at ${MAX_SANDBOXES} with 503 and a wait, before counting the address`, async () => {
		const { demo, store, response, asResponse } = setup();
		store.activeSandboxes.mockResolvedValue(MAX_SANDBOXES);

		const { status, body } = await refusal(demo.create({ locale: 'de' }, client, asResponse));
		expect(status).toBe(503);
		expect(body).toEqual({
			code: 'SANDBOX_LIMIT',
			message: 'Too many demo sandboxes',
			details: { retryAfter: 900 }
		});
		expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '900');
		expect(store.countAttempt).not.toHaveBeenCalled();
		expect(generateDemo).not.toHaveBeenCalled();
	});

	it('refuses a fourth sandbox within the hour with the wait of that window', async () => {
		const { demo, store, response, asResponse } = setup();
		store.countAttempt.mockResolvedValue([
			{ window: 'hour', hits: 4, retryAfter: 1200 },
			{ window: 'day', hits: 4, retryAfter: 50_000 }
		]);

		const { status, body } = await refusal(demo.create({ locale: 'de' }, client, asResponse));
		expect(status).toBe(429);
		expect(apiErrorSchema.safeParse(body).success).toBe(true);
		expect(body).toMatchObject({ code: 'RATE_LIMITED', details: { retryAfter: 1200 } });
		expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '1200');
		expect(store.write).not.toHaveBeenCalled();
	});

	it('waits for the longest window that is used up', async () => {
		const { demo, store, asResponse } = setup();
		store.countAttempt.mockResolvedValue([
			{ window: 'hour', hits: 4, retryAfter: 1200 },
			{ window: 'day', hits: 11, retryAfter: 7200 }
		]);

		const { body } = await refusal(demo.create({ locale: 'de' }, client, asResponse));
		expect(body.details).toEqual({ retryAfter: 7200 });
	});

	it('still allows the tenth of the day and the third of the hour', async () => {
		const { demo, store, asResponse } = setup();
		store.countAttempt.mockResolvedValue([
			{ window: 'hour', hits: 3, retryAfter: 600 },
			{ window: 'day', hits: 10, retryAfter: 7200 }
		]);

		await expect(demo.create({ locale: 'de' }, client, asResponse)).resolves.toBeDefined();
	});

	it('counts one /64 as one visitor and never stores the address itself', async () => {
		const { demo, store, asResponse } = setup();
		await demo.create({ locale: 'de' }, { ...client, ip: '2001:db8:0:a::1' }, asResponse);
		await demo.create({ locale: 'de' }, { ...client, ip: '2001:db8:0:a:ffff::2' }, asResponse);
		await demo.create({ locale: 'de' }, { ...client, ip: '2001:db8:0:b::1' }, asResponse);

		const [first, second, other] = store.countAttempt.mock.calls.map(([address]) => address);
		expect(first).toBe(second);
		expect(other).not.toBe(first);
		expect(first).not.toContain('2001');
	});

	it('salts the address anew the next day', async () => {
		const { demo, store, clock, asResponse } = setup();
		await demo.create({ locale: 'de' }, client, asResponse);
		// 00:30 in Berlin, still the 25th in utc
		clock.now.mockReturnValue(new Date('2026-09-25T22:30:00Z'));
		await demo.create({ locale: 'de' }, client, asResponse);

		const [today, tomorrow] = store.countAttempt.mock.calls.map(([address]) => address);
		expect(today).not.toBe(tomorrow);
	});

	it('writes the plan in the language of the visitor and signs in the employee on shift', async () => {
		const { demo, store, sessions, asResponse } = setup();
		const session = await demo.create({ locale: 'en' }, client, asResponse);

		expect(store.write).toHaveBeenCalledWith(
			expect.objectContaining({ tenant: { id: 'tenant-1' } }),
			'en'
		);
		expect(sessions.open).toHaveBeenCalledWith(asResponse, 'u-worker', client);
		expect(session).toEqual({ csrfToken: 'opened' });
	});

	it('keeps the clock-in of the story once it has passed', async () => {
		const { demo, store, asResponse } = setup();
		await demo.create({ locale: 'de' }, client, asResponse);

		expect(startOf(store.write.mock.calls[0]![0], 'e-worker')).toBe('2026-09-25T08:14:31+02:00');
	});

	it('shows an early visitor the persona clocked in a few minutes ago', async () => {
		const { demo, store, clock, asResponse } = setup();
		// 07:00 in Berlin
		clock.now.mockReturnValue(new Date('2026-09-25T05:00:00Z'));
		await demo.create({ locale: 'de' }, client, asResponse);

		const plan = store.write.mock.calls[0]![0];
		const start = startOf(plan, 'e-worker');
		expect(start).toMatch(/^2026-09-25T06:[45]\d:\d\d\+02:00$/);
		const ahead = Date.parse('2026-09-25T05:00:00Z') - Date.parse(start);
		expect(ahead).toBeGreaterThanOrEqual(5 * 60_000);
		expect(ahead).toBeLessThan(15 * 60_000);
		expect(startOf(plan, 'e-forgot')).toBe('2026-09-24T12:16:00+02:00');
	});

	it('never leaves a timer of today ahead of an early visitor', async () => {
		const { demo, store, clock, asResponse } = setup();
		clock.now.mockReturnValue(new Date('2026-09-25T05:00:00Z'));
		await demo.create({ locale: 'de' }, client, asResponse);

		const plan = store.write.mock.calls[0]![0];
		expect(timerOf(plan, 'e-worker')).toBe(startOf(plan, 'e-worker'));
		expect(Date.parse(timerOf(plan, 'e-solo'))).toBeLessThan(Date.parse('2026-09-25T05:00:00Z'));
		expect(timerOf(plan, 'e-forgot')).toBe('2026-09-24T16:40:00+02:00');
	});

	it('keeps the timers of the story once they have started', async () => {
		const { demo, store, asResponse } = setup();
		await demo.create({ locale: 'de' }, client, asResponse);

		const plan = store.write.mock.calls[0]![0];
		expect(timerOf(plan, 'e-worker')).toBe('2026-09-25T08:18:31+02:00');
		expect(timerOf(plan, 'e-solo')).toBe('2026-09-25T08:34:02+02:00');
	});

	it('does not clock the persona in yesterday for a visitor just after midnight', async () => {
		const { demo, store, sessions, clock, asResponse } = setup();
		clock.now.mockReturnValue(new Date('2026-09-24T22:03:00Z'));
		await demo.create({ locale: 'de' }, client, asResponse);

		expect(startOf(store.write.mock.calls[0]![0], 'e-worker')).toBe('2026-09-25T00:00:00+02:00');
		expect(sessions.open).toHaveBeenCalledWith(asResponse, 'u-worker', client);
	});

	it('hands the next visitor the plan built after the previous answer', async () => {
		const { demo, store, asResponse } = setup();
		await demo.create({ locale: 'de' }, client, asResponse);
		vi.runAllTimers();
		expect(generateDemo).toHaveBeenCalledTimes(2);

		await demo.create({ locale: 'de' }, client, asResponse);
		expect(generateDemo).toHaveBeenCalledTimes(2);
		expect(store.write.mock.calls[1]).toContainEqual(
			expect.objectContaining({ tenant: { id: 'tenant-2' } })
		);
	});

	it('survives a plan that fails in the background and builds the next one on request', async () => {
		const { demo, store, asResponse } = setup();
		const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
		await demo.create({ locale: 'de' }, client, asResponse);
		vi.mocked(generateDemo).mockImplementationOnce(() => {
			throw new Error('no shift on this day');
		});
		expect(() => vi.runAllTimers()).not.toThrow();
		expect(logged).toHaveBeenCalledOnce();

		await demo.create({ locale: 'de' }, client, asResponse);
		expect(generateDemo).toHaveBeenCalledTimes(3);
		expect(store.write).toHaveBeenCalledTimes(2);
	});

	it('does not hand out a plan built for yesterday', async () => {
		const { demo, clock, asResponse } = setup();
		await demo.create({ locale: 'de' }, client, asResponse);
		vi.runAllTimers();
		clock.now.mockReturnValue(new Date('2026-09-25T22:30:00Z'));

		await demo.create({ locale: 'de' }, client, asResponse);
		expect(generateDemo).toHaveBeenCalledTimes(3);
		expect(vi.mocked(generateDemo).mock.calls[2]![0].today.toString()).toBe('2026-09-26');
	});
});

describe('DemoService.switchTo', () => {
	const request = () =>
		({ id: 'r2', cookies: { '__Host-zeit_sid': 'old-token' } }) as unknown as Request;

	it('swaps the session and answers with the new token', async () => {
		const { demo, store, sessions, asResponse } = setup();
		const incoming = request();
		const session = await demo.switchTo('u-hr', incoming, asResponse);

		const token = sessions.setCookie.mock.calls[0]![1];
		expect(token).not.toBe('old-token');
		expect(sessions.setCookie).toHaveBeenCalledWith(asResponse, token);
		expect(store.switchPersona).toHaveBeenCalledWith(
			hashToken('old-token'),
			'u-hr',
			hashToken(token),
			hashToken(csrfTokenFor(token))
		);
		expect(incoming.cookies['__Host-zeit_sid']).toBe(token);
		expect(sessions.current).toHaveBeenCalledWith({ id: 's2' }, incoming);
		expect(session).toEqual({ csrfToken: 'switched' });
	});

	it('answers 404 for someone outside the sandbox and keeps the cookie', async () => {
		const { demo, store, sessions, asResponse } = setup();
		store.switchPersona.mockResolvedValue(false);

		await expect(demo.switchTo('u-elsewhere', request(), asResponse)).rejects.toThrow(
			NotFoundException
		);
		expect(sessions.setCookie).not.toHaveBeenCalled();
	});
});

describe('DemoService.personas', () => {
	it('reads the accounts in the context of the session, whatever role the persona has', async () => {
		const { demo, db, store } = setup();
		const session = { tenantId: 't1', userId: 'u-worker', role: 'employee' } as AuthSession;
		await demo.personas(session);

		expect(db.withTenant).toHaveBeenCalledWith(session, expect.any(Function));
		expect(store.personas).toHaveBeenCalledWith('trx', 'u-worker');
	});
});
