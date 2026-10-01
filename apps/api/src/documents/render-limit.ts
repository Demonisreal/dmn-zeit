// shared in-process counters (D-02): worker.ts enforces the hard limit, render-limit.guard.ts
// uses the same numbers to fail fast on the http route before a job is even queued
export const MAX_CONCURRENT = 2;
export const MAX_QUEUED = 10;
export const RETRY_AFTER_SECONDS = 5;

export class RenderBusyError extends Error {
	constructor() {
		super('Rendering queue is full');
	}
}

let active = 0;
const waiting: Array<() => void> = [];

export function activeCount(): number {
	return active;
}

export function queueDepth(): number {
	return waiting.length;
}

async function acquire(): Promise<void> {
	if (active < MAX_CONCURRENT) {
		active++;
		return;
	}
	if (waiting.length >= MAX_QUEUED) {
		throw new RenderBusyError();
	}
	await new Promise<void>((resolve) => waiting.push(resolve));
	active++;
}

function release(): void {
	active--;
	const next = waiting.shift();
	next?.();
}

export async function withRenderSlot<T>(job: () => Promise<T>): Promise<T> {
	await acquire();
	try {
		return await job();
	} finally {
		release();
	}
}
