import { describe, expect, it } from 'vitest';
import {
	dateFormat,
	formatCents,
	formatClock,
	formatDate,
	formatDays,
	formatInstant,
	formatMinutes,
	formatMonth,
	formatTime
} from './format';

describe('format', () => {
	it('writes minutes as hours and minutes', () => {
		expect(formatMinutes(462)).toBe('7:42 h');
		expect(formatMinutes(2280)).toBe('38:00 h');
		expect(formatMinutes(-15)).toBe('−0:15 h');
		expect(formatMinutes(18, { signed: true })).toBe('+0:18 h');
		expect(formatMinutes(0, { signed: true })).toBe('0:00 h');
	});

	it('pads the clock', () => {
		expect(formatClock(492)).toBe('08:12');
	});

	it('keeps the calendar day of iso dates and the berlin time of instants', () => {
		expect(formatDate('2026-03-29', 'de')).toBe('29.03.2026');
		expect(formatDate('2026-03-29', 'en')).toBe('29/03/2026');
		expect(formatMonth('2026-03', 'de')).toBe('März 2026');
		expect(formatMonth('2026-03', 'en')).toBe('March 2026');
		expect(formatTime('2026-03-29T06:12:00Z', 'de')).toBe('08:12');
		expect(formatTime('2026-03-28T06:12:00Z', 'en')).toBe('07:12');
		expect(formatInstant('2026-03-29T06:12:00Z', 'de')).toBe('29.03.2026, 08:12');
		expect(formatInstant('2026-03-29T06:12:00Z', 'en', { dateStyle: 'medium' })).toBe(
			'29 Mar 2026'
		);
	});

	it('writes cents as euros', () => {
		expect(formatCents('9500', 'de')).toBe('95,00 €');
		expect(formatCents('9500', 'en')).toBe('€95.00');
		expect(formatCents('123456', 'de')).toBe('1.234,56 €');
	});

	it('shows leave days with two decimals in the language of the user', () => {
		expect(formatDays('12.50', 'de')).toBe('12,50');
		expect(formatDays('12.50', 'en')).toBe('12.50');
	});

	it('builds a formatter once per language and options', () => {
		const options = { weekday: 'short', timeZone: 'UTC' } as const;
		expect(dateFormat('de', options)).toBe(dateFormat('de', { ...options }));
		expect(dateFormat('en', options)).not.toBe(dateFormat('de', options));
	});
});
