import { describe, expect, it } from 'vitest';
import { activeCount, MAX_CONCURRENT, MAX_QUEUED, queueDepth, RenderBusyError, withRenderSlot } from './render-limit';

// a job that only finishes once its own resolve() is called, so tests can hold a slot open
function deferred() {
	let release!: () => void;
	const done = new Promise<void>((resolve) => (release = resolve));
	return { release, run: () => withRenderSlot(() => done) };
}

describe('withRenderSlot', () => {
	it('runs at most two jobs at once and queues a third until a slot frees', async () => {
		const first = deferred();
		const second = deferred();
		const third = deferred();

		const firstDone = first.run();
		const secondDone = second.run();
		await Promise.resolve(); // let both acquires settle
		expect(activeCount()).toBe(MAX_CONCURRENT);

		const thirdDone = third.run();
		await Promise.resolve();
		expect(queueDepth()).toBe(1);

		first.release();
		await firstDone;
		await Promise.resolve();
		expect(activeCount()).toBe(2);
		expect(queueDepth()).toBe(0);

		second.release();
		third.release();
		await Promise.all([secondDone, thirdDone]);
		expect(activeCount()).toBe(0);
	});

	it('rejects with RenderBusyError once the queue is full, without touching the active jobs', async () => {
		const running = [deferred(), deferred()];
		const queued = Array.from({ length: MAX_QUEUED }, () => deferred());
		const pending = [...running, ...queued].map((job) => job.run());
		await Promise.resolve();

		expect(activeCount()).toBe(MAX_CONCURRENT);
		expect(queueDepth()).toBe(MAX_QUEUED);
		await expect(withRenderSlot(() => Promise.resolve())).rejects.toBeInstanceOf(RenderBusyError);

		for (const job of [...running, ...queued]) job.release();
		await Promise.all(pending);
		expect(activeCount()).toBe(0);
		expect(queueDepth()).toBe(0);
	});
});
