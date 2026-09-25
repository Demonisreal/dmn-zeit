import { generateDemo } from '@zeit/demo-data';
import {
	DummyDriver,
	Kysely,
	PostgresAdapter,
	PostgresIntrospector,
	PostgresQueryCompiler,
	type CompiledQuery
} from 'kysely';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import type { Database } from '../db/database';
import type { DB } from '../db/schema.generated';
import { DemoStore } from './demo.store';

describe('DemoStore.write', () => {
	it('hands even the longest story to ops.sandbox_seed in one statement', async () => {
		const statements: CompiledQuery[] = [];
		const db = new Kysely<DB>({
			dialect: {
				createAdapter: () => new PostgresAdapter(),
				createDriver: () => new DummyDriver(),
				createIntrospector: (kysely) => new PostgresIntrospector(kysely),
				createQueryCompiler: () => new PostgresQueryCompiler()
			},
			log: (event) => {
				statements.push(event.query);
			}
		});
		// the story starts over in august, the end of july carries the most entries
		const plan = generateDemo({ today: Temporal.PlainDate.from('2027-07-31'), seed: 7 });
		await new DemoStore(db as unknown as Database).write(plan, 'de');

		expect(statements).toHaveLength(1);
		const { sql, parameters } = statements[0]!;
		expect(sql).toBe('select ops.sandbox_seed($1::jsonb, $2)');
		expect(JSON.parse(parameters[0] as string)).toEqual(plan);
		expect(parameters[1]).toBe('de');
	}, 20_000);
});
