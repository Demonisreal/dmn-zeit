import type { Correction } from '@zeit/shared';
import { describe, expect, it } from 'vitest';
import { correctedMail } from './corrections.mail';

const hr = { id: '6f1c2a57-0d7e-4c3b-9a41-2b8e5d7f9c10', displayName: 'Hanna Personal' };

const change: Correction = {
	id: '0b9d3e21-5c4a-4f8e-8d27-6a1f0e9b3c45',
	employee: { id: '9e27c4b8-3f15-4a6d-b0c9-7d2e8f1a5b36', name: 'Erika Muster' },
	action: 'change',
	target: {
		entryId: '4a8f1d63-2e9b-4c57-a3d0-8b6e2f7c1d94',
		startedAt: '2026-09-14T06:00:00Z',
		endedAt: '2026-09-14T10:00:00Z'
	},
	newStartedAt: '2026-09-14T06:00:00Z',
	newEndedAt: '2026-09-14T14:30:00Z',
	reason: 'Gehen vergessen, war bis 16:30 da',
	status: 'approved',
	requestedBy: hr,
	decidedBy: hr,
	decidedAt: '2026-09-24T07:15:00Z',
	decisionNote: null,
	createdAt: '2026-09-24T07:15:00Z'
};

describe('correctedMail', () => {
	it('says who changed which entry on which day and why, formal in German', () => {
		expect(correctedMail('de', { name: 'Erika Muster', correction: change })).toEqual({
			subject: 'Ihre Arbeitszeit wurde korrigiert',
			text: [
				'Hallo Erika Muster,',
				'',
				'Hanna Personal hat am 24.09.2026 eine Buchung Ihrer Arbeitszeit in DMN Zeit korrigiert. Die Korrektur gilt sofort.',
				'',
				'Bisher: 14.09.2026, 08:00–12:00',
				'Jetzt: 14.09.2026, 08:00–16:30',
				'Begründung: Gehen vergessen, war bis 16:30 da',
				'',
				'Haben Sie Fragen dazu, wenden Sie sich bitte an Ihre Personalverwaltung.'
			].join('\n')
		});
	});

	it('names both days of a night shift, in English with the month spelled out', () => {
		const night: Correction = {
			...change,
			action: 'add',
			target: null,
			newStartedAt: '2026-09-14T20:00:00Z',
			newEndedAt: '2026-09-15T04:00:00Z'
		};
		const mail = correctedMail('en', { name: 'Erika', correction: night });
		expect(mail.subject).toBe('Your working time was corrected');
		expect(mail.text).toContain('on 24 September 2026');
		expect(mail.text).toContain('Added: 14 September 2026, 22:00 – 15 September 2026, 06:00');
	});

	it('marks a voided entry that was still running and keeps line breaks out of the text', () => {
		const voided: Correction = {
			...change,
			action: 'void',
			target: { ...change.target!, endedAt: null },
			newStartedAt: null,
			newEndedAt: null,
			reason: 'Doppelt gestempelt\nBcc: someone@example.test'
		};
		const text = correctedMail('de', { name: 'Erika', correction: voided }).text;
		expect(text).toContain('Gestrichen: 14.09.2026, 08:00 (läuft noch)');
		expect(text).toContain('Begründung: Doppelt gestempelt Bcc: someone@example.test');
		expect(text).not.toContain('Jetzt:');
	});
});
