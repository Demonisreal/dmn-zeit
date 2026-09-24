import { describe, expect, it } from 'vitest';
import {
	clean,
	invitationMail,
	mfaResetMail,
	passkeyAddedMail,
	totpEnabledMail
} from './templates';

describe('mail templates', () => {
	it('strips line breaks and control characters from names', () => {
		expect(clean('Anna\r\nBcc: someone@example.test')).toBe('Anna Bcc: someone@example.test');
		expect(clean('Anna‮assoR')).toBe('Anna assoR');
		expect(clean('  Anna  ')).toBe('Anna');
	});

	it('keeps a tenant name from opening a new header line in the subject', () => {
		const mail = invitationMail('de', {
			name: 'Anna',
			tenant: 'Steuerbüro\nX-Injected: 1',
			link: 'https://zeit.example.test/invite#t=x'
		});
		expect(mail.subject).toBe('Einladung zu DMN Zeit (Steuerbüro X-Injected: 1)');
		expect(mail.text).not.toContain('\nX-Injected');
	});

	it('writes the security notices in the language of the person, formal in German', () => {
		expect(totpEnabledMail('de', { name: 'Anna' }).text).toContain('Waren Sie das nicht');
		expect(totpEnabledMail('en', { name: 'Anna' }).subject).toBe(
			'Authenticator app set up for DMN Zeit'
		);
		expect(passkeyAddedMail('de', { name: 'Anna', passkey: 'Laptop\nPhishing' }).text).toContain(
			'„Laptop Phishing“'
		);
		expect(mfaResetMail('en', { name: 'Ben' }).text).toMatch(/^Hello Ben,/);
	});
});
