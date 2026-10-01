import { HttpException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MAX_CONCURRENT, MAX_QUEUED, withRenderSlot } from './render-limit';
import { RenderLimitGuard } from './render-limit.guard';

function deferred() {
	let release!: () => void;
	const done = new Promise<void>((resolve) => (release = resolve));
	return { release, run: () => withRenderSlot(() => done) };
}

function contextWith(headers: Record<string, unknown>): ExecutionContext {
	return {
		switchToHttp: () => ({
			getResponse: () => ({
				setHeader: (name: string, value: unknown) => (headers[name] = value)
			})
		})
	} as unknown as ExecutionContext;
}

describe('RenderLimitGuard', () => {
	it('lets a request through while the pool has room', () => {
		const guard = new RenderLimitGuard();
		expect(guard.canActivate(contextWith({}))).toBe(true);
	});

	it('answers 503 with Retry-After once the pool and its queue are both full', async () => {
		const jobs = Array.from({ length: MAX_CONCURRENT + MAX_QUEUED }, () => deferred());
		const pending = jobs.map((job) => job.run());
		await Promise.resolve();

		const guard = new RenderLimitGuard();
		const headers: Record<string, unknown> = {};
		try {
			guard.canActivate(contextWith(headers));
			throw new Error('expected the guard to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(HttpException);
			expect((error as HttpException).getStatus()).toBe(503);
			expect((error as HttpException).getResponse()).toMatchObject({ code: 'RENDER_BUSY' });
			expect(headers['Retry-After']).toBe(5);
		} finally {
			for (const job of jobs) job.release();
			await Promise.all(pending);
		}
	});
});
