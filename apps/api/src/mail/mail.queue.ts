import { BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailQueue implements BeforeApplicationShutdown {
	private readonly logger = new Logger(MailQueue.name);
	private readonly pending = new Set<Promise<void>>();

	later(work: () => Promise<void>) {
		const job: Promise<void> = new Promise((resolve) => setImmediate(resolve))
			.then(work)
			.catch((error: unknown) => this.logger.error(error))
			.finally(() => this.pending.delete(job));
		this.pending.add(job);
	}

	async beforeApplicationShutdown() {
		await Promise.allSettled(this.pending);
	}
}
