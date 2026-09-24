import { describe, expect, it, vi } from 'vitest';
import { MailQueue } from './mail.queue';

describe('MailQueue', () => {
	it('runs the work only after the current request is done', async () => {
		const queue = new MailQueue();
		const work = vi.fn(async () => {});
		queue.later(work);

		expect(work).not.toHaveBeenCalled();
		await queue.beforeApplicationShutdown();
		expect(work).toHaveBeenCalledOnce();
	});

	it('lets the shutdown wait for what is still on its way', async () => {
		const queue = new MailQueue();
		let sent = false;
		queue.later(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
			sent = true;
		});

		await queue.beforeApplicationShutdown();
		expect(sent).toBe(true);
	});

	it('logs a failed job instead of losing the process to it', async () => {
		const queue = new MailQueue();
		const logged = vi.spyOn(queue['logger'], 'error').mockImplementation(() => {});
		queue.later(async () => {
			throw new Error('resend is down');
		});

		await queue.beforeApplicationShutdown();
		expect(logged).toHaveBeenCalledOnce();
	});
});
