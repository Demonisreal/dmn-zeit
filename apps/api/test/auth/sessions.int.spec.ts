import { activeSessionSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { cookieFrom, expectContract, startApi, type Api } from './api';

let api: Api;

beforeAll(async () => {
	api = await startApi();
});

afterAll(() => api.app.close());

async function twoDevices() {
	const person = await api.member();
	const laptop = api.browser();
	const phone = api.browser();
	await laptop.signIn(person.email);
	await phone.signIn(person.email);
	return { person, laptop, phone };
}

describe('own sessions', () => {
	it('lists every open session and marks the one asking', async () => {
		const { laptop } = await twoDevices();
		const answer = await laptop.get('/auth/sessions');

		expect(answer.status).toBe(200);
		expectContract(z.array(activeSessionSchema), answer.body);
		expect(answer.body).toHaveLength(2);
		expect(answer.body.filter((session: { current: boolean }) => session.current)).toHaveLength(1);
		expect(answer.body[0]).toMatchObject({ ip: expect.stringMatching(/^203\.0\.113\./) });
	});

	it('ends another session, which then no longer gets in', async () => {
		const { laptop, phone } = await twoDevices();
		const sessions = (await laptop.get('/auth/sessions')).body as {
			id: string;
			current: boolean;
		}[];
		const other = sessions.find((session) => !session.current)!;

		expect((await laptop.delete(`/auth/sessions/${other.id}`)).status).toBe(204);
		expect((await phone.get('/auth/session')).status).toBe(401);
		expect((await laptop.get('/auth/session')).status).toBe(200);
		expect((await laptop.delete(`/auth/sessions/${other.id}`)).status).toBe(404);
	});

	it('cannot end the session of someone else', async () => {
		const { laptop } = await twoDevices();
		const stranger = await twoDevices();
		const theirs = (await stranger.laptop.get('/auth/sessions')).body[0].id as string;

		expect((await laptop.delete(`/auth/sessions/${theirs}`)).status).toBe(404);
		expect((await stranger.laptop.get('/auth/session')).status).toBe(200);
	});

	it('logs out: the cookie is cleared and the session is gone', async () => {
		const { laptop, phone } = await twoDevices();
		const cookie = laptop.cookie;
		const answer = await laptop.post('/auth/logout');

		expect(answer.status).toBe(204);
		expect(cookieFrom(answer, 'zeit_sid')).toMatch(/^zeit_sid=; Path=\/; Expires=Thu, 01 Jan 1970/);
		laptop.cookie = cookie;
		expect((await laptop.get('/auth/session')).status).toBe(401);
		expect((await phone.get('/auth/session')).status).toBe(200);
	});
});

describe('POST /api/auth/password/change', () => {
	it('ends every session, opens a new one and sends a notice', async () => {
		const { person, laptop, phone } = await twoDevices();
		expect((await laptop.reauth()).status).toBe(200);
		const answer = await laptop.post('/auth/password/change', {
			currentPassword: 'kaffee ohne milch bitte',
			newPassword: 'ein ganz neues passwort'
		});

		expect(answer.status).toBe(200);
		const before = laptop.cookie;
		laptop.remember(answer);
		expect(laptop.cookie).not.toBe(before);
		expect((await laptop.get('/auth/session')).status).toBe(200);
		expect((await phone.get('/auth/session')).status).toBe(401);

		expect((await api.browser().signIn(person.email, 'ein ganz neues passwort')).status).toBe(200);
		await vi.waitFor(() =>
			expect(
				api.mails.some((mail) => mail.to === person.email && /geändert/.test(mail.subject))
			).toBe(true)
		);
	});

	it('refuses a wrong current password without logging anyone out', async () => {
		const { laptop, phone } = await twoDevices();
		await laptop.reauth();
		const answer = await laptop.post('/auth/password/change', {
			currentPassword: 'kaffee mit milch',
			newPassword: 'ein ganz neues passwort'
		});

		expect(answer.status).toBe(403);
		expect(answer.body.code).toBe('INVALID_CREDENTIALS');
		expect((await phone.get('/auth/session')).status).toBe(200);
	});
});
