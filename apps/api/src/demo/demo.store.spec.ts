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
	it('keeps every statement of the longest story under the bind limit', async () => {
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
		const store = new DemoStore(db as unknown as Database);
		await db.transaction().execute((trx) => store.write(trx, plan, 'de'));

		const inserts = statements.filter((statement) =>
			statement.sql.startsWith('insert into "app"."time_entries"')
		);
		const bound = new Set(inserts.flatMap((statement) => statement.parameters));
		expect(inserts.length).toBeGreaterThan(1);
		expect(plan.entries.every((entry) => bound.has(entry.id))).toBe(true);
		expect(Math.max(...statements.map((statement) => statement.parameters.length))).toBeLessThan(
			65_535
		);
	}, 20_000);
});
