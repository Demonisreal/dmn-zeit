import { z } from 'zod';
import { instantSchema, uuidSchema } from './common';

// authenticator apps show the code as "123 456"
export const totpCodeSchema = z
	.string()
	.transform((code) => code.replace(/\s/g, ''))
	.pipe(z.string().regex(/^\d{6}$/, 'format.totp'));

// handed out as ABCDE-FGH23, accepted with or without dash and spaces, in any case
export const recoveryCodeSchema = z
	.string()
	.transform((code) => code.replace(/[\s-]/g, '').toUpperCase())
	.pipe(z.string().regex(/^[A-Z2-7]{10}$/, 'format.recoveryCode'));

const issuedRecoveryCode = z.string().regex(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);

// the api verifies these with @simplewebauthn/server, here only the outer shape is fixed
const base64url = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const registrationResponseSchema = z.looseObject({
	id: base64url,
	rawId: base64url,
	type: z.literal('public-key'),
	response: z.looseObject({
		clientDataJSON: base64url,
		attestationObject: base64url
	})
});

export const authenticationResponseSchema = z.looseObject({
	id: base64url,
	rawId: base64url,
	type: z.literal('public-key'),
	response: z.looseObject({
		clientDataJSON: base64url,
		authenticatorData: base64url,
		signature: base64url
	})
});

export const passkeyCreationOptionsSchema = z.looseObject({
	challenge: base64url,
	rp: z.looseObject({ name: z.string() }),
	user: z.looseObject({ id: base64url, name: z.string(), displayName: z.string() }),
	pubKeyCredParams: z.array(z.looseObject({ type: z.literal('public-key'), alg: z.number() }))
});

export const passkeyRequestOptionsSchema = z.looseObject({ challenge: base64url });

export const mfaTotpSchema = z.object({ code: totpCodeSchema });
export const mfaRecoverySchema = z.object({ code: recoveryCodeSchema });
export const passkeyAssertionSchema = z.object({ response: authenticationResponseSchema });

export const reauthSchema = z.object({
	password: z.string().min(1).max(128),
	code: totpCodeSchema
});

export const reauthResultSchema = z.object({ reauthUntil: instantSchema });

const passkeyNameSchema = z.string().trim().min(1).max(60);

export const passkeySchema = z.object({
	id: uuidSchema,
	name: z.string(),
	createdAt: instantSchema,
	lastUsedAt: instantSchema.nullable(),
	backedUp: z.boolean()
});

export const createPasskeySchema = z.object({
	response: registrationResponseSchema,
	name: passkeyNameSchema
});

export const renamePasskeySchema = z.object({ name: passkeyNameSchema });

export const securityOverviewSchema = z.object({
	hasTotp: z.boolean(),
	passkeys: z.array(passkeySchema),
	recoveryCodesLeft: z.int().min(0).max(10),
	reauthUntil: instantSchema.nullable()
});

export const totpSetupSchema = z.object({
	otpauthUri: z.string().startsWith('otpauth://totp/'),
	// 20 bytes in base32, for apps that cannot scan
	secret: z.string().regex(/^[A-Z2-7]{32}$/),
	qrSvg: z.string()
});

// empty unless this was the first factor, the codes are only ever shown once
export const recoveryCodesSchema = z.object({
	recoveryCodes: z.array(issuedRecoveryCode).max(10)
});

export const passkeyCreatedSchema = z.object({
	passkey: passkeySchema,
	recoveryCodes: z.array(issuedRecoveryCode).max(10)
});

export type RegistrationResponse = z.infer<typeof registrationResponseSchema>;
export type AuthenticationResponse = z.infer<typeof authenticationResponseSchema>;
export type PasskeyCreationOptions = z.infer<typeof passkeyCreationOptionsSchema>;
export type PasskeyRequestOptions = z.infer<typeof passkeyRequestOptionsSchema>;
export type MfaTotpInput = z.infer<typeof mfaTotpSchema>;
export type MfaRecoveryInput = z.infer<typeof mfaRecoverySchema>;
export type PasskeyAssertionInput = z.infer<typeof passkeyAssertionSchema>;
export type ReauthInput = z.infer<typeof reauthSchema>;
export type ReauthResult = z.infer<typeof reauthResultSchema>;
export type Passkey = z.infer<typeof passkeySchema>;
export type CreatePasskeyInput = z.infer<typeof createPasskeySchema>;
export type RenamePasskeyInput = z.infer<typeof renamePasskeySchema>;
export type SecurityOverview = z.infer<typeof securityOverviewSchema>;
export type TotpSetup = z.infer<typeof totpSetupSchema>;
export type RecoveryCodes = z.infer<typeof recoveryCodesSchema>;
export type PasskeyCreated = z.infer<typeof passkeyCreatedSchema>;
