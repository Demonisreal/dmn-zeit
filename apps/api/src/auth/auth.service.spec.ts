import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from '@node-rs/argon2';
import type { Locale, Role } from '@zeit/shared';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../common/clock';
import type { AuthSession } from '../common/session.guard';
import type { Audit } from '../common/audit';
import { MailQueue } from '../mail/mail.queue';
import { MemoryTransport } from '../mail/memory.transport';
import type { AuthStore, TokenKind } from './auth.store';
import { AuthService } from './auth.service';
import { hashPassword } from './passwords';
import { hashToken, newToken } from './tokens';

type Account = {
	userId: string;
	tenantId: string;
	role: Role;
	status: 'active' | 'invited';
	email: string;
	displayName: string;
	locale: Locale;
	passwordHash: string | null;
	lockedUntil: string | null;
	failures: number;
	loggedOutEverywhere: boolean;
};

const PASSWORD = 'kaffee ohne milch bitte';
const pepper = Buffer.from('pepper-for-the-auth-service-spec');
let annasHash: string;

beforeAll(async () => {
	annasHash = await hashPassword(PASSWORD, pepper);
});

// the auth schema in memory, just enough to follow what the service asks of it
class FakeStore {
	accounts: Account[] = [];
	tokens = new Map<string, { userId: string; kind: TokenKind; used: boolean }>();

	byEmail = (email: string) =>
		this.accounts.find((account) => account.email === email.toLowerCase());
	byId = (userId: string) => this.accounts.find((account) => account.userId === userId)!;

	// like auth.login_lookup, only active accounts
	credential = vi.fn(async (email: string) => {
		const account = this.byEmail(email);
		return account?.status === 'active' ? { ...account } : undefined;
	});
	loginFailed = vi.fn(async (userId: string) => {
		this.byId(userId).failures++;
	});
	profile = vi.fn(async ({ userId }: { userId: string }) => {
		const account = this.byId(userId);
		return {
			user: {
				id: account.userId,
				email: account.email,
				displayName: account.displayName,
				role: account.role,
				locale: account.locale,
				status: account.status,
				employeeId: null,
				lastLoginAt: null
			},
			tenant: {
				id: account.tenantId,
				name: 'Steuerbüro Muster',
				kind: 'live' as const,
				expiresAt: null
			},
			leadsTeams: []
		};
	});
	issueToken = vi.fn(async (userId: string, kind: TokenKind, tokenHash: Buffer) => {
		this.tokens.set(tokenHash.toString('hex'), { userId, kind, used: false });
	});
	inspectToken = vi.fn(async (tokenHash: Buffer, kind: TokenKind) => {
		const token = this.open(tokenHash, kind);
		if (!token) return undefined;
		const account = this.byId(token.userId);
		return {
			userId: account.userId,
			email: account.email,
			displayName: account.displayName,
			tenantName: 'Steuerbüro Muster',
			expiresAt: '2026-09-24T08:30:00Z'
		};
	});
	resetPassword = vi.fn(async (tokenHash: Buffer, passwordHash: string) => {
		const token = this.consume(tokenHash, 'password_reset');
		if (!token) return null;
		Object.assign(this.byId(token.userId), { passwordHash, loggedOutEverywhere: true });
		return token.userId;
	});
	acceptInvitation = vi.fn(async (_requestId: string, tokenHash: Buffer, passwordHash: string) => {
		const token = this.consume(tokenHash, 'invite');
		if (!token) return null;
		Object.assign(this.byId(token.userId), { passwordHash, status: 'active' });
		return token.userId;
	});
	rehash = vi.fn(async (userId: string, _oldHash: string, newHash: string) => {
		this.byId(userId).passwordHash = newHash;
	});
	changePassword = vi.fn(async ({ userId }: { userId: string }, passwordHash: string) => {
		Object.assign(this.byId(userId), { passwordHash, loggedOutEverywhere: true });
	});

	private open(tokenHash: Buffer, kind: TokenKind) {
		const token = this.tokens.get(tokenHash.toString('hex'));
		return token && token.kind === kind && !token.used ? token : undefined;
	}

	private consume(tokenHash: Buffer, kind: TokenKind) {
		const token = this.open(tokenHash, kind);
		if (token) token.used = true;
		return token;
	}
}

function setup() {
	const store = new FakeStore();
	store.accounts.push(
		{
			userId: 'u-anna',
			tenantId: 't1',
			role: 'hr',
			status: 'active',
			email: 'anna@muster.test',
			displayName: 'Anna Adler',
			locale: 'de',
			passwordHash: annasHash,
			lockedUntil: null,
			failures: 0,
			loggedOutEverywhere: false
		},
		{
			userId: 'u-ben',
			tenantId: 't1',
			role: 'employee',
			status: 'invited',
			email: 'ben@muster.test',
			displayName: 'Ben Berg',
			locale: 'en',
			passwordHash: null,
			lockedUntil: null,
			failures: 0,
			loggedOutEverywhere: false
		}
	);

	const clock = { now: () => new Date('2026-09-24T08:00:00Z') };
	const mail = new MemoryTransport();
	const audit = { record: vi.fn(async () => {}) };
	const auth = new AuthService(
		store as unknown as AuthStore,
		mail,
		new MailQueue(),
		audit as unknown as Audit,
		clock as Clock,
		new ConfigService({ APP_ORIGIN: 'https://zeit.example.com', PASSWORD_PEPPER: pepper })
	);
	return { auth, store, audit, clock, mail, anna: store.accounts[0]!, ben: store.accounts[1]! };
}

async function failure(call: Promise<unknown>) {
	try {
		await call;
	} catch (error) {
		if (error instanceof HttpException) {
			return { status: error.getStatus(), ...(error.getResponse() as object) };
		}
		throw error;
	}
	throw new Error('expected the call to fail');
}

const client = { requestId: 'r1', ip: '203.0.113.7', userAgent: 'vitest' };

const annasSession = {
	id: 's1',
	userId: 'u-anna',
	tenantId: 't1',
	role: 'hr',
	workspace: 'company',
	employeeId: null,
	csrfHash: Buffer.alloc(32),
	enrollmentPending: false,
	reauthUntil: null,
	requestId: 'r1'
} satisfies AuthSession;

describe('AuthService.login', () => {
	it('returns the user for the right password, whatever the case of the address', async () => {
		const { auth } = setup();
		expect(await auth.login({ email: 'Anna@Muster.test', password: PASSWORD }, client)).toBe(
			'u-anna'
		);
	});

	it('gives the same answer for an unknown address, a wrong password and an open invitation', async () => {
		const { auth } = setup();
		const answers = await Promise.all([
			failure(auth.login({ email: 'nobody@muster.test', password: PASSWORD }, client)),
			failure(auth.login({ email: 'anna@muster.test', password: 'kaffee mit milch' }, client)),
			failure(auth.login({ email: 'ben@muster.test', password: PASSWORD }, client))
		]);
		expect(new Set(answers.map((answer) => JSON.stringify(answer))).size).toBe(1);
		expect(answers[0]).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
	});

	it('counts only real guesses at a real password towards the lock', async () => {
		const { auth, store, anna, ben } = setup();
		await failure(auth.login({ email: 'anna@muster.test', password: 'kaffee mit milch' }, client));
		await failure(auth.login({ email: 'ben@muster.test', password: 'kaffee mit milch' }, client));

		expect(anna.failures).toBe(1);
		expect(ben.failures).toBe(0);
		expect(store.loginFailed).toHaveBeenCalledTimes(1);
	});

	it('turns away even the right password while the account is locked, without adding to it', async () => {
		const { auth, store, anna, clock } = setup();
		anna.lockedUntil = '2026-09-24T08:04:00Z';

		expect(
			await failure(auth.login({ email: 'anna@muster.test', password: PASSWORD }, client))
		).toMatchObject({ code: 'INVALID_CREDENTIALS' });
		expect(store.loginFailed).not.toHaveBeenCalled();

		clock.now = () => new Date('2026-09-24T08:04:01Z');
		expect(await auth.login({ email: 'anna@muster.test', password: PASSWORD }, client)).toBe(
			'u-anna'
		);
	});

	it('rehashes a password stored with weaker parameters, without ending any session', async () => {
		const { auth, store, anna } = setup();
		const weak = await hash(PASSWORD, { memoryCost: 4096, timeCost: 1, secret: pepper });
		anna.passwordHash = weak;

		await auth.login({ email: 'anna@muster.test', password: PASSWORD }, client);
		expect(store.rehash).toHaveBeenCalledWith(
			'u-anna',
			weak,
			expect.stringMatching(/m=19456,t=2,p=1/)
		);
		expect(store.changePassword).not.toHaveBeenCalled();
	});

	it('leaves a current hash alone', async () => {
		const { auth, store } = setup();
		await auth.login({ email: 'anna@muster.test', password: PASSWORD }, client);
		expect(store.rehash).not.toHaveBeenCalled();
	});

	it('writes a wrong password to the trail, not an unknown address', async () => {
		const { auth, audit } = setup();
		await failure(auth.login({ email: 'anna@muster.test', password: 'kaffee mit milch' }, client));
		await failure(auth.login({ email: 'nobody@muster.test', password: PASSWORD }, client));

		expect(audit.record).toHaveBeenCalledTimes(1);
		expect(audit.record).toHaveBeenCalledWith(
			expect.objectContaining({ userId: 'u-anna', actor: null, action: 'login.failed' })
		);
	});
});

describe('AuthService password reset', () => {
	it('answers before it looks the address up', async () => {
		const { auth, store, mail } = setup();
		auth.forgotPassword('anna@muster.test', 'r1');

		expect(store.credential).not.toHaveBeenCalled();
		await vi.waitFor(() => expect(mail.sent).toHaveLength(1));
	});

	it('mails a reset link whose token only the mail knows', async () => {
		const { auth, store, mail } = setup();
		await auth.sendReset('anna@muster.test', 'r1');

		const [sent] = mail.sent;
		expect(sent).toMatchObject({ tenantId: 't1', to: 'anna@muster.test' });
		expect(sent?.subject).toMatch(/zurücksetzen/);

		const token = sent?.text.match(/https:\/\/zeit\.example\.com\/reset#t=([\w-]{43})/)?.[1];
		expect(store.tokens.get(hashToken(token!).toString('hex'))).toMatchObject({
			userId: 'u-anna',
			kind: 'password_reset'
		});
	});

	it('sends nothing for unknown addresses and open invitations', async () => {
		const { auth, store, mail } = setup();
		await auth.sendReset('nobody@muster.test', 'r1');
		await auth.sendReset('ben@muster.test', 'r1');

		expect(mail.sent).toHaveLength(0);
		expect(store.issueToken).not.toHaveBeenCalled();
	});

	it('sets the new password, ends every session and says so by mail', async () => {
		const { auth, mail, anna } = setup();
		await auth.sendReset('anna@muster.test', 'r1');
		const token = mail.sent[0]!.text.match(/#t=([\w-]{43})/)![1]!;

		await auth.resetPassword({ token, password: 'ein ganz neues passwort' }, 'r2');
		expect(anna.passwordHash).toMatch(/^\$argon2id\$/);
		expect(anna.loggedOutEverywhere).toBe(true);
		await vi.waitFor(() => expect(mail.sent[1]?.subject).toMatch(/geändert/));

		expect(
			await failure(auth.resetPassword({ token, password: 'noch ein neues passwort' }, 'r3'))
		).toMatchObject({ status: 400, code: 'TOKEN_INVALID' });
	});

	it('refuses a common password before it spends the token', async () => {
		const { auth, store, mail } = setup();
		await auth.sendReset('anna@muster.test', 'r1');
		const token = mail.sent[0]!.text.match(/#t=([\w-]{43})/)![1]!;

		expect(
			await failure(auth.resetPassword({ token, password: 'Passwort1234' }, 'r2'))
		).toMatchObject({
			code: 'VALIDATION',
			details: [{ field: 'password', code: 'custom', message: 'password.common' }]
		});
		expect(store.resetPassword).not.toHaveBeenCalled();
	});
});

describe('AuthService invitations', () => {
	async function invite(store: FakeStore) {
		const token = newToken();
		await store.issueToken('u-ben', 'invite', hashToken(token));
		return token;
	}

	it('shows who the invitation is for', async () => {
		const { auth, store } = setup();
		expect(await auth.inspectInvitation(await invite(store))).toEqual({
			email: 'ben@muster.test',
			displayName: 'Ben Berg',
			tenantName: 'Steuerbüro Muster'
		});
		expect(await failure(auth.inspectInvitation(newToken()))).toMatchObject({
			code: 'TOKEN_INVALID'
		});
	});

	it('activates the account with the chosen password, once', async () => {
		const { auth, ben, store } = setup();
		const token = await invite(store);

		await auth.acceptInvitation({ token, password: 'mein eigenes passwort' }, 'r1');
		expect(store.acceptInvitation).toHaveBeenCalledWith('r1', hashToken(token), expect.any(String));
		expect(ben).toMatchObject({
			status: 'active',
			passwordHash: expect.stringMatching(/^\$argon2id\$/)
		});
		expect(
			await auth.login({ email: 'ben@muster.test', password: 'mein eigenes passwort' }, client)
		).toBe('u-ben');

		expect(
			await failure(auth.acceptInvitation({ token, password: 'mein eigenes passwort' }, 'r2'))
		).toMatchObject({ code: 'TOKEN_INVALID' });
	});

	it('does not hash for a token that does not exist', async () => {
		const { auth, store } = setup();
		await failure(
			auth.acceptInvitation({ token: newToken(), password: 'mein eigenes passwort' }, 'r1')
		);
		expect(store.acceptInvitation).not.toHaveBeenCalled();
	});
});

describe('AuthService.changePassword', () => {
	it('needs the current password and counts a wrong one', async () => {
		const { auth, anna, store, audit } = setup();
		const input = { currentPassword: 'kaffee mit milch', newPassword: 'ein ganz neues passwort' };

		expect(await failure(auth.changePassword(annasSession, input, client))).toMatchObject({
			status: 403,
			code: 'INVALID_CREDENTIALS'
		});
		expect(anna.failures).toBe(1);
		expect(store.changePassword).not.toHaveBeenCalled();
		expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'reauth.failed' }));
	});

	it('swaps the password, ends the other sessions and sends a notice', async () => {
		const { auth, anna, mail } = setup();
		await auth.changePassword(
			annasSession,
			{ currentPassword: PASSWORD, newPassword: 'ein ganz neues passwort' },
			client
		);

		expect(anna.loggedOutEverywhere).toBe(true);
		expect(
			await auth.login({ email: 'anna@muster.test', password: 'ein ganz neues passwort' }, client)
		).toBe('u-anna');
		await vi.waitFor(() => expect(mail.sent[0]).toMatchObject({ to: 'anna@muster.test' }));
	});

	it('writes the notice in the language of the person', async () => {
		const { auth, ben, store, mail } = setup();
		const token = newToken();
		await store.issueToken('u-ben', 'invite', hashToken(token));
		await auth.acceptInvitation({ token, password: 'mein eigenes passwort' }, 'r1');

		await auth.changePassword(
			{ ...annasSession, userId: ben.userId, role: 'employee' },
			{ currentPassword: 'mein eigenes passwort', newPassword: 'ein ganz neues passwort' },
			client
		);
		await vi.waitFor(() =>
			expect(mail.sent[0]?.subject).toBe('Your DMN Zeit password was changed')
		);
	});

	it('refuses a common new password', async () => {
		const { auth } = setup();
		expect(
			await failure(
				auth.changePassword(
					annasSession,
					{ currentPassword: PASSWORD, newPassword: 'qwertz123456' },
					client
				)
			)
		).toMatchObject({
			code: 'VALIDATION',
			details: [{ field: 'newPassword', message: 'password.common' }]
		});
	});
});
