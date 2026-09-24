import { totpSetupSchema } from '@zeit/shared';
import { Secret, TOTP } from 'otpauth';
import { describe, expect, it } from 'vitest';
import { newTotpSecret, stepOf, totpSetup } from './totp';

const at = new Date('2026-09-24T08:00:10Z');
const stepAt = Math.floor(at.getTime() / 30_000);

// what an authenticator app on the phone would show
function appCode(secret: Buffer, when: Date) {
	return new TOTP({ secret: Secret.fromHex(secret.toString('hex')) }).generate({
		timestamp: when.getTime()
	});
}

const shifted = (seconds: number) => new Date(at.getTime() + seconds * 1000);

describe('TOTP', () => {
	it('accepts the current code and names its step', () => {
		const secret = newTotpSecret();
		expect(stepOf(secret, appCode(secret, at), at)).toBe(stepAt);
	});

	it('allows one step of clock drift either way, not two', () => {
		const secret = newTotpSecret();
		expect(stepOf(secret, appCode(secret, shifted(-30)), at)).toBe(stepAt - 1);
		expect(stepOf(secret, appCode(secret, shifted(30)), at)).toBe(stepAt + 1);
		expect(stepOf(secret, appCode(secret, shifted(-60)), at)).toBeNull();
		expect(stepOf(secret, appCode(secret, shifted(60)), at)).toBeNull();
	});

	it('refuses the code of another secret', () => {
		expect(stepOf(newTotpSecret(), appCode(newTotpSecret(), at), at)).toBeNull();
	});

	it('hands out the setup as the contract wants it, labelled with issuer and address', async () => {
		const setup = await totpSetup(newTotpSecret(), 'anna@example.test');
		expect(totpSetupSchema.safeParse(setup).success).toBe(true);
		expect(setup.otpauthUri).toContain('issuer=DMN%20Zeit');
		expect(setup.otpauthUri).toContain('DMN%20Zeit:anna%40example.test');
	});

	it('draws the qr code as a plain svg, without scripts, handlers or links', async () => {
		const { qrSvg } = await totpSetup(newTotpSecret(), '<script>alert(1)</script>@example.test');
		expect(qrSvg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
		expect(qrSvg).not.toMatch(/<script|\son\w+=|href|<foreignObject/i);
	});
});
