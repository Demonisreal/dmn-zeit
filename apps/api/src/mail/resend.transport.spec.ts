import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResendTransport } from './resend.transport';

// placeholder values, no real key or address
const transport = new ResendTransport('re_test_placeholder', 'DMN Zeit <zeit@example.test>');
const mail = {
	tenantId: 't1',
	to: 'anna@example.test',
	subject: 'Passwort für DMN Zeit zurücksetzen',
	text: 'https://zeit.example.test/reset#t=secret-token'
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('ResendTransport', () => {
	it('sends the mail as text with a timeout', async () => {
		const fetch = vi.fn(async () => new Response('{"id":"1"}', { status: 200 }));
		vi.stubGlobal('fetch', fetch);
		await transport.send(mail);

		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://api.resend.com/emails');
		expect(JSON.parse(init.body as string)).toEqual({
			from: 'DMN Zeit <zeit@example.test>',
			to: ['anna@example.test'],
			subject: mail.subject,
			text: mail.text
		});
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it('fails with status and error name only, never with what resend quotes back', async () => {
		const quoted = JSON.stringify({
			statusCode: 422,
			name: 'validation_error',
			message: `Invalid to field: anna@example.test, text: ${mail.text}`
		});
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(quoted, { status: 422 }))
		);

		const failure = await transport.send(mail).catch((error: Error) => error);
		expect(failure).toBeInstanceOf(Error);
		expect((failure as Error).message).toBe('Resend answered 422 validation_error');
	});
});
