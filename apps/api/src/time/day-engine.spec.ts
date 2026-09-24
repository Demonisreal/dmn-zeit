import { describe, expect, it } from 'vitest';
import { buildDays, clockState, localDate, summarizeFlex } from './day-engine';
import type { AbsenceDayRow, ContractRow, EntryRow, Sheet, TenantSettings } from './time.store';

const tenant: TenantSettings = {
	state: 'NW',
	holidayOptions: [],
	halfDays: false,
	flexCap: { plusMinutes: null, minusMinutes: null },
	flexCapMode: 'none'
};

const fullTime: ContractRow = {
	validFrom: '2025-01-01',
	minutes: { mon: 480, tue: 480, wed: 480, thu: 480, fri: 480, sat: 0, sun: 0 },
	vacationDaysYear: '30.0',
	vacationBasisDays: 5,
	flexCap: null
};

function sheetOf(parts: Partial<Sheet> = {}): Sheet {
	return {
		employee: {
			id: 'e1',
			name: 'Erika Muster',
			entryDate: '2025-01-01',
			exitDate: null,
			closedThrough: null
		},
		contracts: [fullTime],
		entries: [],
		absences: [],
		acks: [],
		...parts
	};
}

let lastId = 0;
// stamps carry their local offset, so the first ten characters are the workday
function entry(startedAt: string, endedAt: string | null, endReason: EntryRow['endReason'] = null) {
	return {
		id: `00000000-0000-4000-8000-${String(++lastId).padStart(12, '0')}`,
		employeeId: 'e1',
		workday: startedAt.slice(0, 10),
		startedAt,
		endedAt,
		endReason: endReason ?? (endedAt ? 'leave' : null),
		source: 'seed',
		requestId: null,
		voidedAt: null
	} satisfies EntryRow;
}

function absence(
	date: string,
	type: AbsenceDayRow['type'],
	status: AbsenceDayRow['status'],
	portion: 0.5 | 1 = 1
) {
	return { date, requestId: '10000000-0000-4000-8000-000000000001', type, status, portion };
}

const noon = new Date('2026-09-24T12:00:00+02:00');
const codes = (day: { findings: { code: string }[] }) =>
	day.findings.map((finding) => finding.code);

describe('buildDays', () => {
	it('counts worked time, the break and the gap to the target', () => {
		const sheet = sheetOf({
			entries: [
				entry('2026-09-22T08:00:00+02:00', '2026-09-22T12:00:00+02:00', 'break'),
				entry('2026-09-22T12:30:00+02:00', '2026-09-22T16:45:00+02:00')
			]
		});
		const [day] = buildDays(sheet, tenant, { from: '2026-09-22', to: '2026-09-22' }, noon);

		expect(day).toMatchObject({
			date: '2026-09-22',
			target: { minutes: 480, explanation: { key: 'target.workday' } },
			workedMinutes: 495,
			breakMinutes: 30,
			creditedMinutes: 0,
			diffMinutes: 15,
			running: false,
			holiday: null,
			absence: null,
			locked: false
		});
		expect(day!.entries).toHaveLength(2);
		expect(codes(day!)).toEqual(['ARBZG_3_OVER_8']);
	});

	it('counts a running entry up to now', () => {
		const sheet = sheetOf({ entries: [entry('2026-09-24T08:00:00+02:00', null)] });
		const [day] = buildDays(sheet, tenant, { from: '2026-09-24', to: '2026-09-24' }, noon);

		expect(day).toMatchObject({ workedMinutes: 240, running: true, diffMinutes: -240 });
	});

	it('measures real time on 29 March, when the clocks go forward', () => {
		const sheet = sheetOf({
			entries: [entry('2026-03-29T00:30:00+01:00', '2026-03-29T05:00:00+02:00')]
		});
		const [day] = buildDays(sheet, tenant, { from: '2026-03-29', to: '2026-03-29' }, noon);

		expect(day).toMatchObject({ workedMinutes: 210, diffMinutes: 210 });
		expect(codes(day!)).toEqual(['ARBZG_9_SUNDAY']);
	});

	it('files a night shift over the extra hour on 25 October under the day it began', () => {
		const sheet = sheetOf({
			entries: [entry('2026-10-24T22:00:00+02:00', '2026-10-25T06:00:00+01:00')]
		});
		const [saturday, sunday] = buildDays(
			sheet,
			tenant,
			{ from: '2026-10-24', to: '2026-10-25' },
			noon
		);

		expect(saturday).toMatchObject({ workedMinutes: 540, target: { minutes: 0 } });
		expect(codes(saturday!)).toEqual([
			'ARBZG_3_OVER_8',
			'ARBZG_4_BREAK_SHORT',
			'ARBZG_4_CONTINUOUS_6H'
		]);
		expect(sunday).toMatchObject({ workedMinutes: 0, entries: [], findings: [] });
	});

	it('drops the target on a public holiday and flags the work done on it', () => {
		const sheet = sheetOf({
			entries: [entry('2026-05-01T09:00:00+02:00', '2026-05-01T13:00:00+02:00')]
		});
		const [day] = buildDays(sheet, tenant, { from: '2026-05-01', to: '2026-05-01' }, noon);

		expect(day).toMatchObject({
			target: {
				minutes: 0,
				explanation: { key: 'target.holiday', params: { code: 'labour_day' } }
			},
			holiday: { code: 'labour_day', portion: 1 },
			diffMinutes: 240
		});
		expect(codes(day!)).toEqual(['ARBZG_9_HOLIDAY']);
	});

	it('halves 24 December only for a tenant that keeps half days', () => {
		const range = { from: '2026-12-24', to: '2026-12-24' };
		const [half] = buildDays(sheetOf(), { ...tenant, halfDays: true }, range, noon);
		const [whole] = buildDays(sheetOf(), tenant, range, noon);

		expect(half).toMatchObject({
			target: { minutes: 240, explanation: { key: 'target.half_holiday' } },
			holiday: { code: 'christmas_eve', portion: 0.5 }
		});
		expect(whole).toMatchObject({ target: { minutes: 480 }, holiday: null });
	});

	it('reports a short rest after midnight on the second day, the first one only leads in', () => {
		const sheet = sheetOf({
			entries: [
				entry('2026-09-21T14:00:00+02:00', '2026-09-21T23:00:00+02:00'),
				entry('2026-09-22T07:00:00+02:00', '2026-09-22T11:00:00+02:00')
			]
		});
		const days = buildDays(sheet, tenant, { from: '2026-09-22', to: '2026-09-22' }, noon);

		expect(days).toHaveLength(1);
		expect(days[0]!.entries).toHaveLength(1);
		expect(days[0]!.findings).toEqual([
			expect.objectContaining({
				code: 'ARBZG_5_REST_UNDER_11H',
				facts: { restMinutes: 480 },
				explanation: { key: 'finding.arbzg_5_rest_under_11h', params: { restMinutes: 480 } },
				ack: null
			})
		]);
	});

	it('credits approved vacation and sick leave with the target of the absent share', () => {
		const sheet = sheetOf({
			entries: [entry('2026-09-22T08:00:00+02:00', '2026-09-22T12:00:00+02:00')],
			absences: [
				absence('2026-09-21', 'vacation', 'approved'),
				absence('2026-09-22', 'vacation', 'approved', 0.5),
				absence('2026-09-23', 'time_off', 'approved'),
				absence('2026-09-24', 'sick', 'approved'),
				absence('2026-09-25', 'vacation', 'pending')
			]
		});
		const days = buildDays(sheet, tenant, { from: '2026-09-21', to: '2026-09-25' }, noon);

		expect(days.map((day) => [day.creditedMinutes, day.diffMinutes])).toEqual([
			[480, 0],
			[240, 0],
			[0, -480],
			[480, 0],
			[0, -480]
		]);
		expect(days[4]!.absence).toEqual({
			requestId: '10000000-0000-4000-8000-000000000001',
			type: 'vacation',
			status: 'pending',
			portion: 1
		});
	});

	it('locks every day up to closed_through', () => {
		const sheet = sheetOf({ employee: { ...sheetOf().employee, closedThrough: '2026-08-31' } });
		const days = buildDays(sheet, tenant, { from: '2026-08-31', to: '2026-09-01' }, noon);

		expect(days.map((day) => day.locked)).toEqual([true, false]);
	});

	it('hands the acknowledgement to its finding and leaves the others open', () => {
		const lead = { id: '20000000-0000-4000-8000-000000000001', displayName: 'Tom Leitung' };
		const sheet = sheetOf({
			entries: [entry('2026-10-24T22:00:00+02:00', '2026-10-25T06:00:00+01:00')],
			acks: [
				{
					date: '2026-10-24',
					code: 'ARBZG_4_BREAK_SHORT',
					ruleVersion: 'arbzg-1994',
					note: 'Inventur, abgesprochen',
					at: '2026-10-26T09:00:00Z',
					by: lead
				}
			]
		});
		const [day] = buildDays(sheet, tenant, { from: '2026-10-24', to: '2026-10-24' }, noon);

		expect(day!.findings.map((finding) => [finding.code, finding.ack])).toEqual([
			['ARBZG_3_OVER_8', null],
			[
				'ARBZG_4_BREAK_SHORT',
				{ at: '2026-10-26T09:00:00Z', by: lead, note: 'Inventur, abgesprochen' }
			],
			['ARBZG_4_CONTINUOUS_6H', null]
		]);
	});

	it('has no target before the entry date', () => {
		const sheet = sheetOf({ employee: { ...sheetOf().employee, entryDate: '2026-09-23' } });
		const days = buildDays(sheet, tenant, { from: '2026-09-22', to: '2026-09-23' }, noon);

		expect(days.map((day) => day.target.minutes)).toEqual([0, 480]);
		expect(days[0]!.target.explanation.key).toBe('target.outside_employment');
	});
});

describe('summarizeFlex', () => {
	it('runs the balance from the opening through each month', () => {
		const sheet = sheetOf({
			employee: { ...sheetOf().employee, closedThrough: '2026-01-31' },
			entries: [
				entry('2026-01-29T08:00:00+01:00', '2026-01-29T16:30:00+01:00'),
				entry('2026-01-30T08:00:00+01:00', '2026-01-30T16:00:00+01:00'),
				entry('2026-02-02T08:00:00+01:00', '2026-02-02T15:00:00+01:00'),
				entry('2026-02-03T08:00:00+01:00', '2026-02-03T16:00:00+01:00')
			]
		});
		const days = buildDays(sheet, tenant, { from: '2026-01-29', to: '2026-02-03' }, noon);
		const booking = (type: 'opening' | 'manual', minutes: number, effectiveDate: string) => ({
			id: `30000000-0000-4000-8000-00000000000${minutes > 0 ? 1 : 2}`,
			employeeId: 'e1',
			type,
			minutes,
			effectiveDate,
			reason: 'Saldo aus dem Vorjahr',
			monthClosingId: null,
			createdBy: null,
			createdAt: '2026-01-01T08:00:00Z'
		});

		const flex = summarizeFlex(
			days,
			[booking('opening', 120, '2026-01-01'), booking('manual', -60, '2026-02-02')],
			'2026-01-31'
		);

		expect(flex.openingMinutes).toBe(120);
		expect(flex.months).toEqual([
			{
				month: '2026-01',
				targetMinutes: 960,
				workedMinutes: 990,
				creditedMinutes: 0,
				bookedMinutes: 0,
				diffMinutes: 30,
				balanceMinutes: 150,
				closed: true
			},
			{
				month: '2026-02',
				targetMinutes: 960,
				workedMinutes: 900,
				creditedMinutes: 0,
				bookedMinutes: -60,
				diffMinutes: -60,
				balanceMinutes: 30,
				closed: false
			}
		]);
		expect(flex.balanceMinutes).toBe(30);
	});
});

describe('clockState', () => {
	const today = '2026-09-24';
	const at = (time: string) => `${today}T${time}:00+02:00`;

	it('is working while an entry runs, counting the morning too', () => {
		const running = entry(at('12:30'), null);
		const clock = clockState(
			[entry(at('08:00'), at('12:00'), 'break'), running],
			today,
			new Date(at('13:00'))
		);

		expect(clock).toEqual({
			state: 'working',
			workday: today,
			workedMinutes: 270,
			entryId: running.id,
			since: at('12:30')
		});
	});

	it('is on a break after stamping one', () => {
		const clock = clockState([entry(at('08:00'), at('12:00'), 'break')], today, noon);
		expect(clock).toEqual({
			state: 'on_break',
			workday: today,
			workedMinutes: 240,
			since: at('12:00')
		});
	});

	it('is off after leaving and on a day without entries', () => {
		expect(clockState([entry(at('08:00'), at('16:00'))], today, noon)).toEqual({
			state: 'off',
			workday: today,
			workedMinutes: 480
		});
		expect(clockState([], today, noon)).toEqual({ state: 'off', workday: today, workedMinutes: 0 });
	});

	it('keeps a night shift on the workday it began', () => {
		const clock = clockState(
			[entry('2026-09-23T22:00:00+02:00', null)],
			today,
			new Date(at('01:00'))
		);
		expect(clock).toMatchObject({ state: 'working', workday: '2026-09-23', workedMinutes: 180 });
	});
});

describe('localDate', () => {
	it('gives the date in Berlin, not in UTC', () => {
		expect(localDate(new Date('2026-09-23T22:30:00Z'))).toBe('2026-09-24');
		expect(localDate(new Date('2026-01-15T22:59:00Z'))).toBe('2026-01-15');
	});
});
