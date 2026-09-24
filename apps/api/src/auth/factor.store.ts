import { Injectable } from '@nestjs/common';
import type { Role } from '@zeit/shared';
import { sql } from 'kysely';
import { Database, type TenantContext } from '../db/database';

export type ChallengePurpose = 'register' | 'login' | 'reauth';

export type Factors = { hasTotp: boolean; passkeyCount: number; recoveryLeft: number };

export type TotpRow = { sealed: Buffer; confirmed: boolean };

// whose a challenge or passkey is, enough to file a failure in the trail of their tenant
export type Scope = { userId: string; tenantId: string; role: Role };

export type PasskeyRow = {
	id: string;
	credentialId: Buffer;
	name: string;
	transports: string[];
	backedUp: boolean;
	createdAt: string;
	lastUsedAt: string | null;
};

export type StoredPasskey = Scope & {
	id: string;
	publicKey: Buffer;
	transports: string[];
};

export type NewPasskey = {
	credentialId: Buffer;
	publicKey: Buffer;
	counter: number;
	transports: string[];
	aaguid: string;
	backedUp: boolean;
	name: string;
};

// totp, recovery codes, passkeys and the challenges around them, all through auth.* functions
@Injectable()
export class FactorStore {
	constructor(private readonly db: Database) {}

	async factors(userId: string): Promise<Factors> {
		const { rows } = await sql<Factors>`
			select has_totp as "hasTotp", passkey_count as "passkeyCount", recovery_left as "recoveryLeft"
			from auth.factors(${userId})`.execute(this.db);
		return rows[0]!;
	}

	async beginTotp(userId: string, sealed: Buffer, keyVersion: number): Promise<boolean> {
		const { rows } = await sql<{ begun: boolean }>`
			select auth.totp_begin(${userId}, ${sealed}, ${keyVersion}) as begun`.execute(this.db);
		return rows[0]!.begun;
	}

	async totp(userId: string): Promise<TotpRow | undefined> {
		const { rows } = await sql<TotpRow>`
			select secret_enc as sealed, confirmed from auth.totp_secret(${userId})`.execute(this.db);
		return rows[0];
	}

	async confirmTotp(userId: string, step: number, codeHashes: Buffer[] | null): Promise<boolean> {
		const { rows } = await sql<{ confirmed: boolean }>`
			select auth.totp_confirm(${userId}, ${step}, ${codeHashes}::bytea[]) as confirmed`.execute(this.db);
		return rows[0]!.confirmed;
	}

	// false for a step already used, that is a replayed code
	async useTotpStep(userId: string, step: number): Promise<boolean> {
		const { rows } = await sql<{ used: boolean }>`
			select auth.totp_use_step(${userId}, ${step}) as used`.execute(this.db);
		return rows[0]!.used;
	}

	async removeTotp(userId: string): Promise<boolean> {
		const { rows } = await sql<{ removed: boolean }>`
			select auth.totp_remove(${userId}) as removed`.execute(this.db);
		return rows[0]!.removed;
	}

	async replaceRecoveryCodes(userId: string, codeHashes: Buffer[]): Promise<void> {
		await sql`select auth.recovery_codes_replace(${userId}, ${codeHashes}::bytea[])`.execute(
			this.db
		);
	}

	async useRecoveryCode(userId: string, codeHash: Buffer): Promise<boolean> {
		const { rows } = await sql<{ used: boolean }>`
			select auth.recovery_code_use(${userId}, ${codeHash}) as used`.execute(this.db);
		return rows[0]!.used;
	}

	async passkeys(userId: string): Promise<PasskeyRow[]> {
		const { rows } = await sql<PasskeyRow>`
			select id, credential_id as "credentialId", name, transports, backed_up as "backedUp",
				created_at as "createdAt", last_used_at as "lastUsedAt"
			from auth.passkeys_list(${userId})`.execute(this.db);
		return rows;
	}

	async addPasskey(userId: string, passkey: NewPasskey): Promise<string> {
		const { rows } = await sql<{ id: string }>`
			select auth.passkey_add(${userId}, ${passkey.credentialId}, ${passkey.publicKey},
				${passkey.counter}, ${passkey.transports}::text[], ${passkey.aaguid}::uuid,
				${passkey.backedUp}, ${passkey.name}) as id`.execute(this.db);
		return rows[0]!.id;
	}

	async renamePasskey(userId: string, passkeyId: string, name: string): Promise<boolean> {
		const { rows } = await sql<{ renamed: boolean }>`
			select auth.passkey_rename(${userId}, ${passkeyId}, ${name}) as renamed`.execute(this.db);
		return rows[0]!.renamed;
	}

	async removePasskey(userId: string, passkeyId: string): Promise<boolean> {
		const { rows } = await sql<{ removed: boolean }>`
			select auth.passkey_remove(${userId}, ${passkeyId}) as removed`.execute(this.db);
		return rows[0]!.removed;
	}

	async findPasskey(credentialId: Buffer): Promise<StoredPasskey | undefined> {
		const { rows } = await sql<StoredPasskey>`
			select id, user_id as "userId", tenant_id as "tenantId", role, public_key as "publicKey",
				transports
			from auth.passkey_find(${credentialId})`.execute(this.db);
		return rows[0];
	}

	// false when the counter did not move forward, the mark of a cloned authenticator
	async touchPasskey(passkeyId: string, counter: number, backedUp: boolean): Promise<boolean> {
		const { rows } = await sql<{ touched: boolean }>`
			select auth.passkey_touch(${passkeyId}, ${counter}, ${backedUp}) as touched`.execute(this.db);
		return rows[0]!.touched;
	}

	async createChallenge(
		challenge: Buffer,
		purpose: ChallengePurpose,
		userId: string | null
	): Promise<void> {
		await sql`select auth.webauthn_challenge_create(${challenge},
			${purpose}::auth.webauthn_purpose, ${userId}::uuid)`.execute(this.db);
	}

	async consumeChallenge(
		challenge: Buffer,
		purpose: ChallengePurpose,
		userId: string | null
	): Promise<boolean> {
		const { rows } = await sql<{ consumed: boolean }>`
			select auth.webauthn_challenge_consume(${challenge}, ${purpose}::auth.webauthn_purpose,
				${userId}::uuid) as consumed`.execute(this.db);
		return rows[0]!.consumed;
	}

	async createMfaChallenge(userId: string, tokenHash: Buffer): Promise<void> {
		await sql`select auth.mfa_challenge_create(${userId}, ${tokenHash})`.execute(this.db);
	}

	// counts the attempt first; nothing once the step expired, ran out of tries or the account locked
	async attemptMfaChallenge(tokenHash: Buffer): Promise<Scope | undefined> {
		const { rows } = await sql<Scope>`
			select user_id as "userId", tenant_id as "tenantId", role
			from auth.mfa_challenge_attempt_with_scope(${tokenHash})`.execute(this.db);
		return rows[0];
	}

	async consumeMfaChallenge(tokenHash: Buffer): Promise<string | null> {
		const { rows } = await sql<{ userId: string | null }>`
			select auth.mfa_challenge_consume(${tokenHash}) as "userId"`.execute(this.db);
		return rows[0]?.userId ?? null;
	}

	// the confirmation holds for ten minutes, the same window resolveSession reads
	async reauth(sessionId: string): Promise<string> {
		const { rows } = await sql<{ reauthUntil: string }>`
			select auth.session_reauth(${sessionId}) + interval '10 minutes' as "reauthUntil"`.execute(this.db);
		return rows[0]!.reauthUntil;
	}

	async finishEnrollment(sessionId: string): Promise<void> {
		await sql`select auth.enrollment_finish(${sessionId})`.execute(this.db);
	}

	// the function itself checks for an admin of the same tenant and refuses one's own account
	resetFactors(admin: TenantContext, userId: string): Promise<void> {
		return this.db.withTenant(admin, async (trx) => {
			await sql`select auth.mfa_reset(${userId})`.execute(trx);
		});
	}
}
