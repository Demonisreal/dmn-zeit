import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const env = {
	APP_MODE: 'demo',
	APP_ORIGIN: 'http://localhost:5173',
	DATABASE_URL: 'postgres://zeit_app:zeit_app@127.0.0.1:54330/zeit?sslmode=disable',
	TRUSTED_PROXY: '127.0.0.1/32'
};

const pepper = randomBytes(32).toString('base64');
const dataKey = randomBytes(32).toString('base64');

const live = {
	...env,
	APP_MODE: 'live',
	APP_ORIGIN: 'https://zeit.example.com',
	MAIL_FROM: 'DMN Zeit <zeit@example.com>',
	RESEND_API_KEY: 're_test',
	PASSWORD_PEPPER: pepper,
	DATA_ENCRYPTION_KEY: dataKey
};

describe('loadConfig', () => {
	it('fills in the port', () => {
		expect(loadConfig(env).PORT).toBe(3001);
		expect(loadConfig({ ...env, PORT: '3100' }).PORT).toBe(3100);
	});

	it('treats empty lines from .env as unset', () => {
		const config = loadConfig({ ...env, PORT: '', MAIL_FROM: '', RESEND_API_KEY: '' });
		expect(config.PORT).toBe(3001);
		expect(config.MAIL_FROM).toBeUndefined();
	});

	it('names every invalid value, not only the missing ones', () => {
		expect(() => loadConfig({ ...env, APP_MODE: 'staging', DATABASE_URL: undefined })).toThrow(
			/^Invalid configuration: APP_MODE: .+; DATABASE_URL: .+$/
		);
	});

	it('wants a bare origin', () => {
		expect(() => loadConfig({ ...env, APP_ORIGIN: 'https://zeit.example.com/' })).toThrow(
			/APP_ORIGIN/
		);
		expect(() => loadConfig({ ...env, APP_ORIGIN: 'javascript:alert(1)' })).toThrow(/APP_ORIGIN/);
	});

	it('only takes postgres urls for the database', () => {
		expect(() => loadConfig({ ...env, DATABASE_URL: 'mysql://root@localhost/zeit' })).toThrow(
			/DATABASE_URL/
		);
	});

	it('takes a list of cidr ranges as trusted proxies', () => {
		expect(loadConfig({ ...env, TRUSTED_PROXY: '172.28.2.0/24, fd00::/8' }).TRUSTED_PROXY).toBe(
			'172.28.2.0/24, fd00::/8'
		);
		for (const wrong of ['0.0.0.0/0', '10.0.0.0/8,::/0', 'loopback', '172.28.2.5', '']) {
			expect(() => loadConfig({ ...env, TRUSTED_PROXY: wrong }), wrong).toThrow(/TRUSTED_PROXY/);
		}
	});

	it('needs mail, pepper, data key and https in live mode', () => {
		expect(loadConfig(live).APP_MODE).toBe('live');
		for (const key of ['MAIL_FROM', 'RESEND_API_KEY', 'PASSWORD_PEPPER', 'DATA_ENCRYPTION_KEY']) {
			expect(() => loadConfig({ ...live, [key]: '' }), key).toThrow(new RegExp(`${key}: Required`));
		}
		expect(() => loadConfig({ ...live, APP_ORIGIN: 'http://zeit.example.com' })).toThrow(
			/APP_ORIGIN: Has to be https/
		);
	});

	it('decodes the secrets and refuses anything but 32 bytes', () => {
		const config = loadConfig(live);
		expect(config.PASSWORD_PEPPER.equals(Buffer.from(pepper, 'base64'))).toBe(true);
		expect(config.DATA_ENCRYPTION_KEY).toHaveLength(32);

		const short = randomBytes(16).toString('base64');
		expect(() => loadConfig({ ...live, PASSWORD_PEPPER: short })).toThrow(/PASSWORD_PEPPER/);
		expect(() => loadConfig({ ...live, DATA_ENCRYPTION_KEY: 'not base64!' })).toThrow(
			/DATA_ENCRYPTION_KEY/
		);
	});

	it('falls back to fixed 32 byte stand-ins outside live', () => {
		const config = loadConfig(env);
		expect(config.PASSWORD_PEPPER).toHaveLength(32);
		expect(config.DATA_ENCRYPTION_KEY).toHaveLength(32);
		expect(config.PASSWORD_PEPPER.equals(config.DATA_ENCRYPTION_KEY)).toBe(false);
	});

	it('does not echo secret values in the error', () => {
		const leaked = 'c2VjcmV0LXZhbHVlLXRoYXQtaXMtdG9vLXNob3J0';
		expect(() => loadConfig({ ...live, PASSWORD_PEPPER: leaked })).not.toThrow(leaked);
	});
});
