import { generateDemo } from '@zeit/demo-data';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Clock } from '../../src/common/clock';
import { DemoService } from '../../src/demo/demo.service';
import { openSandbox, startDemo, type Demo } from './sandbox';

vi.mock('@zeit/demo-data', { spy: true });

type Run = { ms: number; plans: number };

let demo: Demo;
let runs: Run[] = [];

beforeAll(async () => {
	demo = await startDemo();
	const service = demo.app.get(DemoService);
	const create = service.create.bind(service);
	// timed in the handler: in this process the next plan is built before supertest reads the answer
	vi.spyOn(service, 'create').mockImplementation(async (...args) => {
		const before = vi.mocked(generateDemo).mock.calls.length;
		const start = performance.now();
		const session = await create(...args);
		runs.push({
			ms: Math.round(performance.now() - start),
			plans: vi.mocked(generateDemo).mock.calls.length - before
		});
		return session;
	});
});

afterAll(() => demo.app.close());

async function timed() {
	runs = [];
	const { session } = await openSandbox(demo);
	return { ...runs[0]!, tenantId: session.tenant.id };
}

async function entriesOf(tenantId: string) {
	const { rows } = await demo.superuser.query(
		'select count(*)::int as n from app.time_entries where tenant_id = $1',
		[tenantId]
	);
	return rows[0].n as number;
}

// every test file clones its own database from the template, all in the same container
async function otherTestFiles() {
	const { rows } = await demo.superuser.query(
		`select count(*)::int as n from pg_database where datname like 'zeit_%' and datname <> current_database()`
	);
	return rows[0].n as number;
}

// the last create queued prepare() in a setImmediate, this one runs after it
const prepared = () => new Promise((resolve) => setImmediate(resolve));

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1]!;

describe('POST /api/demo/sandboxes timing', () => {
	it('builds the plan inside the first request of the day', async ({ annotate }) => {
		const cold = await timed();
		expect(cold.plans).toBe(1);
		await annotate(`cold: ${cold.ms} ms`);
	});

	it('takes the plan prepared after the previous request', async () => {
		await prepared();
		expect((await timed()).plans).toBe(0);
	});

	// a wall-clock budget means nothing while other files write their sandboxes into the same postgres
	it('writes a prepared plan in under 1.5 s', async ({ annotate, skip }) => {
		const busy = await otherTestFiles();
		const warm = [];
		for (let i = 0; i < 5; i++) {
			await prepared();
			warm.push(await timed());
		}
		const ms = warm.map((run) => run.ms);
		await annotate(
			`warm: ${ms.join(' / ')} ms for ${await entriesOf(warm[0]!.tenantId)} time entries`
		);
		expect(warm.map((run) => run.plans)).toEqual([0, 0, 0, 0, 0]);

		skip(busy + (await otherTestFiles()) > 0, 'other test files were running, run this file alone');
		expect(median(ms)).toBeLessThan(1500);
	});

	// the story reaches back to january of the year before, the end of july is its longest day
	it('times the write of a prepared plan on 31 july', { timeout: 60_000 }, async ({ annotate }) => {
		vi.spyOn(demo.app.get(Clock), 'now').mockReturnValue(new Date('2026-07-31T09:30:00Z'));
		await timed();
		await prepared();
		const peak = await timed();
		expect(peak.plans).toBe(0);
		await annotate(
			`31 july, warm: ${peak.ms} ms for ${await entriesOf(peak.tenantId)} time entries`
		);
	});
});
