import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { generateDemo, type DemoPlan, type PlanRow } from '@zeit/demo-data';
import type { ApiError, CreateSandboxInput, OutboxMail, Persona, Session } from '@zeit/shared';
import type { Request, Response } from 'express';
import { Temporal } from 'temporal-polyfill';
import { SessionService } from '../auth/session.service';
import { csrfTokenFor, hashToken, newToken } from '../auth/tokens';
import type { Client } from '../common/client.decorator';
import { Clock } from '../common/clock';
import type { AuthSession } from '../common/session.guard';
import { Database } from '../db/database';
import { berlinToday } from '../vacation/buckets';
import { networkOf } from './address';
import { DemoStore, type Attempt } from './demo.store';

export const MAX_SANDBOXES = 300;
const PURGE_SECONDS = 15 * 60;
const LIMITS: Record<Attempt['window'], number> = { hour: 3, day: 10 };

function refuse(
	response: Response,
	status: HttpStatus,
	code: 'RATE_LIMITED' | 'SANDBOX_LIMIT',
	message: string,
	retryAfter: number
) {
	response.setHeader('Retry-After', String(retryAfter));
	return new HttpException({ code, message, details: { retryAfter } } satisfies ApiError, status);
}

const freshPlan = (today: Temporal.PlainDate) => generateDemo({ today, seed: randomInt(2 ** 32) });

function shiftOf(plan: DemoPlan, today: Temporal.PlainDate): PlanRow<'entries'> {
	return plan.entries.find(
		(entry) => entry.endedAt === null && entry.startedAt.startsWith(today.toString())
	)!;
}

function clockInBefore(shift: { startedAt: string }, today: Temporal.PlainDate, now: Date) {
	const instant = Temporal.Instant.fromEpochMilliseconds(now.getTime());
	if (Temporal.Instant.compare(Temporal.Instant.from(shift.startedAt), instant) <= 0) return;

	const start = instant.subtract({ seconds: randomInt(5 * 60, 15 * 60) });
	const midnight = today.toZonedDateTime('Europe/Berlin').toInstant();
	shift.startedAt = (Temporal.Instant.compare(start, midnight) < 0 ? midnight : start)
		.toZonedDateTimeISO('Europe/Berlin')
		.toString({ timeZoneName: 'never', smallestUnit: 'second' });
}

function timersBefore(
	plan: DemoPlan,
	shift: PlanRow<'entries'>,
	today: Temporal.PlainDate,
	now: Date
) {
	const runsToday = (entry: PlanRow<'projectEntries'>) =>
		entry.endedAt === null && entry.startedAt.startsWith(today.toString());
	const timer = plan.projectEntries.find(
		(entry) => runsToday(entry) && entry.employeeId === shift.employeeId
	)!;
	if (Date.parse(timer.startedAt) > now.getTime()) timer.startedAt = shift.startedAt;
	clockInBefore(plan.solo.projectEntries.find(runsToday)!, today, now);
}

@Injectable()
export class DemoService {
	private readonly logger = new Logger(DemoService.name);
	private salt = { day: '', secret: Buffer.alloc(0) };
	private prepared: { day: string; plan: DemoPlan } | undefined;

	constructor(
		private readonly db: Database,
		private readonly store: DemoStore,
		private readonly sessions: SessionService,
		private readonly clock: Clock
	) {}

	async create(input: CreateSandboxInput, client: Client, response: Response): Promise<Session> {
		if ((await this.store.activeSandboxes()) >= MAX_SANDBOXES) {
			throw refuse(
				response,
				HttpStatus.SERVICE_UNAVAILABLE,
				'SANDBOX_LIMIT',
				'Too many demo sandboxes',
				PURGE_SECONDS
			);
		}

		const now = this.clock.now();
		const today = berlinToday(now);
		const attempts = await this.store.countAttempt(this.addressKey(client.ip, today.toString()));
		const over = attempts.filter((attempt) => attempt.hits > LIMITS[attempt.window]);
		if (over.length > 0) {
			throw refuse(
				response,
				HttpStatus.TOO_MANY_REQUESTS,
				'RATE_LIMITED',
				'Too many sandboxes from this address',
				Math.max(...over.map((attempt) => attempt.retryAfter))
			);
		}

		const plan = this.planFor(today);
		const shift = shiftOf(plan, today);
		clockInBefore(shift, today, now);
		timersBefore(plan, shift, today, now);
		await this.store.write(plan, input.locale);
		const starter = plan.users.find((user) => user.employeeId === shift.employeeId)!;
		const session = await this.sessions.open(response, starter.id, client);
		setImmediate(() => this.prepare(today));
		return session;
	}

	personas(session: AuthSession): Promise<Persona[]> {
		return this.db.withTenant(session, (trx) => this.store.personas(trx, session.userId));
	}

	async switchTo(userId: string, request: Request, response: Response): Promise<Session> {
		const name = this.sessions.cookieName;
		const token = newToken();
		const switched = await this.store.switchPersona(
			hashToken(request.cookies[name] as string),
			userId,
			hashToken(token),
			hashToken(csrfTokenFor(token))
		);
		if (!switched) throw new NotFoundException('No persona with this id in the sandbox');

		this.sessions.setCookie(response, token);
		request.cookies[name] = token;
		const session = await this.sessions.resolve(request);
		return this.sessions.current(session!, request);
	}

	outbox(session: AuthSession): Promise<OutboxMail[]> {
		return this.db.withTenant(session, (trx) => this.store.outbox(trx));
	}

	private planFor(today: Temporal.PlainDate): DemoPlan {
		const ready = this.prepared?.day === today.toString() ? this.prepared.plan : undefined;
		this.prepared = undefined;
		return ready ?? freshPlan(today);
	}

	private prepare(today: Temporal.PlainDate) {
		if (this.prepared?.day === today.toString()) return;
		try {
			this.prepared = { day: today.toString(), plan: freshPlan(today) };
		} catch (error) {
			this.logger.error(error, 'Could not prepare the next sandbox');
		}
	}

	private addressKey(ip: string | null, day: string): string {
		if (this.salt.day !== day) this.salt = { day, secret: randomBytes(32) };
		return createHmac('sha256', this.salt.secret)
			.update(networkOf(ip ?? ''))
			.digest('base64url');
	}
}
