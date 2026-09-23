import { describe, expect, it } from 'vitest';
import { loginResultSchema } from './auth';
import {
	authenticationResponseSchema,
	createPasskeySchema,
	recoveryCodeSchema,
	totpCodeSchema
} from './security';

describe('totpCodeSchema', () => {
	it('drops the space the apps put in the middle', () => {
		expect(totpCodeSchema.parse('123 456')).toBe('123456');
		expect(totpCodeSchema.safeParse('12345a').success).toBe(false);
		expect(totpCodeSchema.safeParse('1234567').success).toBe(false);
	});
});

describe('recoveryCodeSchema', () => {
	it('accepts the code however it was typed', () => {
		expect(recoveryCodeSchema.parse('ABCDE-FGH23')).toBe('ABCDEFGH23');
		expect(recoveryCodeSchema.parse(' abcde fgh23 ')).toBe('ABCDEFGH23');
	});

	it('knows the base32 alphabet has no 0, 1, 8 or 9', () => {
		expect(recoveryCodeSchema.safeParse('ABCDE-FGH10').success).toBe(false);
		expect(recoveryCodeSchema.safeParse('ABCDE-FGH2').success).toBe(false);
	});
});

describe('webauthn payloads', () => {
	const assertion = {
		id: 'q1w2e3r4',
		rawId: 'q1w2e3r4',
		type: 'public-key',
		response: {
			clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0In0',
			authenticatorData: 'SZYN5YgOjGh0NBcPZHZgW4',
			signature: 'MEUCIQDx',
			userHandle: 'dXNlcg'
		},
		clientExtensionResults: {},
		authenticatorAttachment: 'platform'
	};

	it('passes fields it does not know on to the api', () => {
		const parsed = authenticationResponseSchema.parse(assertion);
		expect(parsed.clientExtensionResults).toEqual({});
		expect(parsed.response.userHandle).toBe('dXNlcg');
	});

	it('still wants the fields the library needs', () => {
		const unsigned = { ...assertion, response: { ...assertion.response, signature: undefined } };
		expect(authenticationResponseSchema.safeParse(unsigned).success).toBe(false);
	});

	it('wants a name for a new passkey', () => {
		const registration = {
			id: 'q1w2e3r4',
			rawId: 'q1w2e3r4',
			type: 'public-key',
			response: { clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIn0', attestationObject: 'o2Nm' }
		};
		expect(createPasskeySchema.safeParse({ response: registration, name: '  ' }).success).toBe(
			false
		);
		expect(createPasskeySchema.safeParse({ response: registration, name: 'Laptop' }).success).toBe(
			true
		);
	});
});

describe('loginResultSchema', () => {
	it('tells a second step apart from a session', () => {
		const step = loginResultSchema.parse({ mfaRequired: true, methods: ['totp', 'passkey'] });
		expect('mfaRequired' in step).toBe(true);
		expect(loginResultSchema.safeParse({ mfaRequired: true, methods: [] }).success).toBe(false);
	});
});
