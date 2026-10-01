import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Role } from '@zeit/shared';
import type pg from 'pg';
import request from 'supertest';
import { expect } from 'vitest';
import type { ZodType } from 'zod';
import { hashPassword } from '../../src/auth/passwords';
import { hashToken, newToken } from '../../src/auth/tokens';
import { MailTransport } from '../../src/mail/mail.transport';
import type { MemoryTransport } from '../../src/mail/memory.transport';
import { connectAs, createTenant, createUser, databaseUrl } from '../helpers/pg';
import { SoftAuthenticator } from './authenticator';

// a test password, nowhere else in use
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
	// the passkeys of the people this file created, so a browser can answer the second step
	const authenticators = new Map<string, SoftAuthenticator>();

	// an active person with a password and a passkey as second factor, by default in a tenant of their own
	async function member(options: { tenantId?: string; role?: Role } = {}) {
		const tenantId = options.tenantId ?? (await createTenant());
		const { userId } = await createUser(tenantId, { role: options.role ?? 'employee' });
		await superuser.query('insert into auth.credentials (user_id, password_hash) values ($1, $2)', [
			userId,
			await hashPassword(PASSWORD, pepper)
		]);

		const authenticator = new SoftAuthenticator(origin, userId);
		// straight into the table, auth.passkey_add wants the person as app.user_id of a session
		await superuser.query(
			`insert into auth.passkeys (user_id, credential_id, public_key, counter, transports, backed_up, name)
			 values ($1, $2, $3, 0, '{internal}', false, 'Testschlüssel')`,
			[userId, authenticator.credentialId, authenticator.publicKey]
		);
		const email = await emailOf(superuser, userId);
		authenticators.set(email, authenticator);
		return { tenantId, userId, email, authenticator };
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
		// all default addresses share 203.0.113.0/24, tests of the network limit bring their own
		browser: (address?: string) => new Browser(app.getHttpServer(), origin, authenticators, address)
	};
}

async function emailOf(db: pg.Client, userId: string) {
	const { rows } = await db.query<{ email: string }>('select email from app.users where id = $1', [
		userId
	]);
	return rows[0]!.email;
}

// parsing strips unknown keys at every depth, so an extra field in the answer breaks the equality
export function expectContract(schema: ZodType, body: unknown) {
	const parsed = schema.safeParse(body);
	expect(parsed.error).toBeUndefined();
	expect(parsed.data).toEqual(body);
}

export function cookieFrom(response: request.Response, name: string) {
	const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
	return cookies?.find((cookie) => cookie.startsWith(`${name}=`));
}

// what the spa does: same-origin json writes, the cookies it was given, the csrf token from the answer
export class Browser {
	cookie: string | undefined;
	mfaCookie: string | undefined;
	csrf: string | undefined;
	private email: string | undefined;

	constructor(
		private readonly http: ReturnType<NestExpressApplication['getHttpServer']>,
		private readonly origin: string,
		private readonly authenticators: Map<string, SoftAuthenticator>,
		readonly address = nextAddress()
	) {}

	get(path: string) {
		return this.headers(request(this.http).get(`/api${path}`));
	}

	post(path: string, body: object = {}) {
		return this.headers(request(this.http).post(`/api${path}`)).send(body);
	}

	patch(path: string, body: object) {
		return this.headers(request(this.http).patch(`/api${path}`)).send(body);
	}

	delete(path: string) {
		return this.headers(request(this.http).delete(`/api${path}`)).send({});
	}

	// password first, then the passkey if the api asks for a second step and one is known
	async signIn(email: string, password = PASSWORD) {
		this.email = email.toLowerCase();
		const answer = await this.post('/auth/login', { email, password });
		this.remember(answer);

		const authenticator = this.authenticators.get(this.email);
		if (!answer.body?.mfaRequired || !authenticator) return answer;

		const options = await this.post('/auth/mfa/passkey/options');
		const session = await this.post('/auth/mfa/passkey', {
			response: authenticator.assert(options.body)
		});
		this.remember(session);
		return session;
	}

	// the step-up the security page asks for before a sensitive change
	async reauth() {
		const authenticator = this.authenticators.get(this.email!)!;
		const options = await this.post('/auth/reauth/passkey/options');
		return this.post('/auth/reauth/passkey', { response: authenticator.assert(options.body) });
	}

	remember(response: request.Response) {
		const prefix = this.origin.startsWith('https:') ? '__Host-' : '';
		const session = cookieFrom(response, `${prefix}zeit_sid`);
		if (session) this.cookie = session.split(';')[0];
		const mfa = cookieFrom(response, `${prefix}zeit_mfa`);
		if (mfa) this.mfaCookie = mfa.split(';')[0];
		if (response.body?.csrfToken) this.csrf = response.body.csrfToken;
	}

	private headers(test: request.Test) {
		test.set('X-Forwarded-For', this.address).set('Sec-Fetch-Site', 'same-origin');
		const cookies = [this.cookie, this.mfaCookie].filter(Boolean).join('; ');
		if (cookies) test.set('Cookie', cookies);
		if (this.csrf) test.set('X-CSRF-Token', this.csrf);
		return test;
	}
}
