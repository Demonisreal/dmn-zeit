import { fc, test } from '@fast-check/vitest';
import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { TIMER_HINT_AFTER_MINUTES } from '../projects';
import { longTimerEntries, type SourcedEntry } from './long-entries';

const BERLIN = 'Europe/Berlin';
const local = (text: string) => Temporal.ZonedDateTime.from(`${text}[${BERLIN}]`).toInstant();

const entry = (
	id: string,
	start: string,
	end: string,
	source: SourcedEntry['source'] = 'timer'
): SourcedEntry => ({ id, start: local(start), end: local(end), source });

describe('longTimerEntries', () => {
	it('stays silent below twelve hours', () => {
		expect(longTimerEntries([entry('e1', '2026-05-11T16:40', '2026-05-12T04:39:59')])).toEqual([]);
	});

	it('reports a timer from twelve hours on, like the hint on the running timer', () => {
		expect(
			longTimerEntries([
				entry('e1', '2026-05-11T16:40', '2026-05-12T04:40'),
				entry('e2', '2026-05-12T08:00', '2026-05-12T09:30'),
				entry('e3', '2026-05-12T16:40', '2026-05-13T08:31')
			])
		).toEqual([
			{ entryId: 'e1', minutes: 720 },
			{ entryId: 'e3', minutes: 951 }
		]);
	});

	it('counts the hour the clocks go back', () => {
		expect(longTimerEntries([entry('e1', '2026-10-24T20:00', '2026-10-25T07:30')])).toEqual([
			{ entryId: 'e1', minutes: 750 }
		]);
	});

	it.each(['manual', 'seed'] as const)('takes a long %s entry as meant', (source) => {
		expect(longTimerEntries([entry('e1', '2026-05-11T06:00', '2026-05-11T20:00', source)])).toEqual(
			[]
		);
	});
});

const nearTwelveHours = fc
	.integer({ min: -120, max: 120 })
	.map((seconds) => TIMER_HINT_AFTER_MINUTES * 60 + seconds);

describe('longTimerEntries properties', () => {
	test.prop([fc.oneof(fc.integer({ min: 1, max: 3 * 24 * 3600 }), nearTwelveHours)], {
		numRuns: 1000
	})('a timer is reported from twelve hours on, with its whole minutes', (seconds) => {
		const start = local('2026-10-24T20:00');
		const found = longTimerEntries([
			{ id: 'e1', start, end: start.add({ seconds }), source: 'timer' }
		]);
		expect(found).toEqual(
			seconds >= TIMER_HINT_AFTER_MINUTES * 60
				? [{ entryId: 'e1', minutes: Math.round(seconds / 60) }]
				: []
		);
	});
});
