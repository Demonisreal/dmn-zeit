import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageLimitError } from '../../src/documents/render-limit';
import { runInThread, type RenderJob } from '../../src/documents/worker';

const filename = fileURLToPath(new URL('./thread-fixture.mjs', import.meta.url));
const job = (kind: string) => ({ kind }) as unknown as RenderJob;

afterEach(() => vi.restoreAllMocks());

describe('runInThread', () => {
	it('hands back what the thread posts, as buffers again', async () => {
		const [document] = await runInThread(job('done'), { filename });
		expect(document!.format).toBe('pdf');
		expect(Buffer.isBuffer(document!.content)).toBe(true);
		expect(document!.content.toString('latin1')).toBe('%PDF-');
	});

	it('ends an endless loop after the timeout and terminates the thread', async () => {
		const terminate = vi.spyOn(Worker.prototype, 'terminate');
		await expect(runInThread(job('spin'), { filename, timeoutMs: 300 })).rejects.toThrow(
			'Rendering timed out after 0.3s'
		);
		expect(terminate).toHaveBeenCalledOnce();
		await expect(terminate.mock.results[0]!.value).resolves.toBe(1);
	});

	// a global --max-old-space-size (e.g. from NODE_OPTIONS) overrides resourceLimits, vitest.config resets it
	it('runs out of memory inside its own heap limit', async () => {
		await expect(
			runInThread(job('hoard'), {
				filename,
				timeoutMs: 3000,
				resourceLimits: { maxOldGenerationSizeMb: 16, maxYoungGenerationSizeMb: 4 }
			})
		).rejects.toMatchObject({ code: 'ERR_WORKER_OUT_OF_MEMORY' });
	});

	it('brings a page limit across the thread boundary as PageLimitError', async () => {
		await expect(runInThread(job('pages'), { filename })).rejects.toBeInstanceOf(PageLimitError);
	});
});
