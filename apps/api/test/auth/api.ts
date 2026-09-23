import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { hashPassword } from '../../src/auth/passwords';
import { hashToken, newToken } from '../../src/auth/tokens';
import { MailTransport } from '../../src/mail/mail.transport';
import type { MemoryTransport } from '../../src/mail/memory.transport';
import { connectAs, createTenant, createUser, databaseUrl } from '../helpers/pg';

export const PASSWORD = 'kaffee ohne milch bitte';

let lastAddress = 0;
// every browser comes from its own address, so the login limit of one test leaves the next alone
const nextAddress = () => `203.0.113.${++lastAddress}`;

export type Api = Awaited<ReturnType<typeof startApi>>;

// app.module reads its config on first import, so the env has to be in place before that
export async function startApi(origin = 'http://localhost:5173') {
	Object.assign(process.env, {
		APP_MODE: 'test',
		APP_ORIGIN: origin,
		DATABASE_URL: databaseUrl('app'),
		TRUSTED_PROXY: '127.0.0.1/32'
	});
	const { createApp } = await import('../../src/app');
	const app: NestExpressApplication = await createApp();
	await app.init();

	const superuser = await connectAs('superuser');
	const pepper = app.get(ConfigService).get<Buffer>('PASSWORD_PEPPER')!;
	const mails = (app.get(MailTransport) as MemoryTransport).sent;

	// an active person with a password, in a tenant of their own
	async function member(password = PASSWORD) {
		const tenantId = await createTenant();
		const { userId } = await createUser(tenantId);
		await superuser.query('insert into auth.credentials (user_id, password_hash) values ($1, $2)', [
			userId,
			await hashPassword(password, pepper)
		]);
		return { tenantId, userId, email: await emailOf(superuser, userId) };
	}

	async function invited() {
		const tenantId = await createTenant();
		const { userId } = await createUser(tenantId);
		await superuser.query(`update app.users set status = 'invited' where id = $1`, [userId]);
		const token = newToken();
		await superuser.query(`select auth.token_issue($1, 'invite', $2)`, [userId, hashToken(token)]);
		return { userId, token, email: await emailOf(superuser, userId) };
	}

	return {
		app,
		http: app.getHttpServer(),
		superuser,
		mails,
		member,
		invited,
		browser: () => new Browser(app.getHttpServer(), origin)
	};
}

async function emailOf(db: pg.Client, userId: string) {
	const { rows } = await db.query<{ email: string }>('select email from app.users where id = $1', [
		userId
	]);
	return rows[0]!.email;
}

export function cookieFrom(response: request.Response, name: string) {
	const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
	return cookies?.find((cookie) => cookie.startsWith(`${name}=`));
}

// what the spa does: same-origin json writes, the cookie from the login, the csrf token from the answer
export class Browser {
	readonly address = nextAddress();
	cookie: string | undefined;
	csrf: string | undefined;

	constructor(
		private readonly http: ReturnType<NestExpressApplication['getHttpServer']>,
		private readonly origin: string
	) {}

	get(path: string) {
		return this.headers(request(this.http).get(`/api${path}`));
	}

	post(path: string, body: object = {}) {
		return this.headers(request(this.http).post(`/api${path}`)).send(body);
	}

	delete(path: string) {
		return this.headers(request(this.http).delete(`/api${path}`)).send({});
	}

	async signIn(email: string, password = PASSWORD) {
		const response = await this.post('/auth/login', { email, password });
		this.remember(response);
		return response;
	}

	remember(response: request.Response) {
		const name = this.origin.startsWith('https:') ? '__Host-zeit_sid' : 'zeit_sid';
		const cookie = cookieFrom(response, name);
		if (cookie) this.cookie = cookie.split(';')[0];
		if (response.body?.csrfToken) this.csrf = response.body.csrfToken;
	}

	private headers(test: request.Test) {
		test.set('X-Forwarded-For', this.address).set('Sec-Fetch-Site', 'same-origin');
		if (this.cookie) test.set('Cookie', this.cookie);
		if (this.csrf) test.set('X-CSRF-Token', this.csrf);
		return test;
	}
}
