import type { Session } from '@zeit/shared';
import { PinoLogger } from 'nestjs-pino';
import { expect } from 'vitest';
import { Browser } from '../auth/api';
import { connectAs, databaseUrl } from '../helpers/pg';

const ORIGIN = 'http://localhost:5173';

export type Demo = Awaited<ReturnType<typeof startDemo>>;

// startApi pins APP_MODE to test, and app.module reads the mode on first import
export async function startDemo() {
	Object.assign(process.env, {
		APP_MODE: 'demo',
		APP_ORIGIN: ORIGIN,
		DATABASE_URL: databaseUrl('app'),
		TRUSTED_PROXY: '127.0.0.1/32'
	});
	const { createApp } = await import('../../src/app');
	const app = await createApp();
	await app.init();
	// the demo logs every request at info, test mode stays at warn
	PinoLogger.root.level = 'warn';

	return {
		app,
		http: app.getHttpServer(),
		superuser: await connectAs('superuser'),
		// every browser comes from its own address, the sandbox limit counts per address
		visitor: () => new Browser(app.getHttpServer(), ORIGIN, new Map())
	};
}

// what the landing page does: ask for a sandbox and keep the session it opens
export async function openSandbox(demo: Demo, visitor = demo.visitor()) {
	const answer = await visitor.post('/demo/sandboxes', { locale: 'de' });
	expect(answer.status).toBe(201);
	visitor.remember(answer);
	return { visitor, session: answer.body as Session };
}
