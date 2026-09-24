import request from 'supertest';
import { csrfTokenFor, hashToken, newToken } from '../../src/auth/tokens';
import type { Api } from '../auth/api';

let lastAddress = 0;

// signed in past password and second factor, the way the spa is once the setup is done
export class Desk {
	// its own address, so the rate limit of one desk leaves the others alone
	private readonly address = `198.51.100.${++lastAddress}`;

	constructor(
		private readonly http: Api['http'],
		private readonly token: string
	) {}

	get(path: string) {
		return this.headers(request(this.http).get(`/api${path}`));
	}

	post(path: string, body: object = {}) {
		return this.headers(request(this.http).post(`/api${path}`)).send(body);
	}

	patch(path: string, body: object = {}) {
		return this.headers(request(this.http).patch(`/api${path}`)).send(body);
	}

	put(path: string, body: object = {}) {
		return this.headers(request(this.http).put(`/api${path}`)).send(body);
	}

	delete(path: string) {
		return this.headers(request(this.http).delete(`/api${path}`)).send({});
	}

	private headers(test: request.Test) {
		return test
			.set('X-Forwarded-For', this.address)
			.set('Sec-Fetch-Site', 'same-origin')
			.set('Cookie', `zeit_sid=${this.token}`)
			.set('X-CSRF-Token', csrfTokenFor(this.token));
	}
}

// writes the session straight into auth.sessions, the login itself is tested under test/auth
export async function signedIn(api: Api, userId: string, options: { reauth?: boolean } = {}) {
	const token = newToken();
	await api.superuser.query(
		`insert into auth.sessions (user_id, token_hash, csrf_hash, idle_expires_at,
			absolute_expires_at, reauth_at)
		 values ($1, $2, $3, now() + interval '12 hours', now() + interval '7 days',
			case when $4 then now() end)`,
		[userId, hashToken(token), hashToken(csrfTokenFor(token)), options.reauth ?? false]
	);
	return new Desk(api.http, token);
}
