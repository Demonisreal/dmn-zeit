import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import {
	passkeyAssertionSchema,
	registrationResponseSchema,
	type PasskeyCreationOptions,
	type PasskeyRequestOptions
} from '@zeit/shared';

export const passkeyCancelled = (err: unknown) =>
	err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError');

export const passkeyExists = (err: unknown) =>
	err instanceof Error && err.name === 'InvalidStateError';

export async function signWithPasskey(optionsJSON: PasskeyRequestOptions) {
	return passkeyAssertionSchema.parse({ response: await startAuthentication({ optionsJSON }) });
}

export async function createPasskeyCredential(optionsJSON: PasskeyCreationOptions) {
	return registrationResponseSchema.parse(await startRegistration({ optionsJSON }));
}
