import { wholeMinutes, type Span } from '../calendar';
import { timerHint } from '../projects';

export type SourcedEntry = Span & { id: string; source: 'timer' | 'manual' | 'seed' };

export type LongEntry = { entryId: string; minutes: number };

export const longTimerEntries = (entries: readonly SourcedEntry[]): LongEntry[] =>
	entries
		.filter((entry) => entry.source === 'timer' && timerHint(entry.start, entry.end))
		.map((entry) => ({ entryId: entry.id, minutes: wholeMinutes([entry]) }));
