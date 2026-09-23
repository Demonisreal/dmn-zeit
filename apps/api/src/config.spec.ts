import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const env = {
	APP_MODE: 'demo',
	APP_ORIGIN: 'http://localhost:5173',
	DATABASE_URL: 'postgres://zeit_app:zeit_app@127.0.0.1:54330/zeit?sslmode=disable',
	TRUSTED_PROXY: '127.0.0.1/32'
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

	it('needs mail settings in live mode', () => {
		expect(() => loadConfig({ ...env, APP_MODE: 'live', MAIL_FROM: '' })).toThrow(/MAIL_FROM/);
		expect(
			loadConfig({
				...env,
				APP_MODE: 'live',
				MAIL_FROM: 'DMN Zeit <zeit@example.com>',
				RESEND_API_KEY: 're_test'
			}).APP_MODE
		).toBe('live');
	});

	it('names what is missing', () => {
		expect(() => loadConfig({ ...env, APP_MODE: 'staging', DATABASE_URL: undefined })).toThrow(
			'Incomplete configuration: APP_MODE, DATABASE_URL'
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
});
