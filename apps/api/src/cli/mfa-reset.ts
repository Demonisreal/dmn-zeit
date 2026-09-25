import type { Locale } from '@zeit/shared';
import { sql } from 'kysely';
import type { Config } from '../config';
import type { Database } from '../db/database';
import { ResendTransport } from '../mail/resend.transport';
import { mfaResetMail } from '../mail/templates';

export type ResetPerson = {
	userId: string;
	tenantId: string;
	displayName: string;
	locale: Locale;
	email: string;
};

// the function sets the tenant context of the person itself and writes the trail as source cli
export async function resetMfa(db: Database, email: string): Promise<ResetPerson | undefined> {
	const { rows } = await sql<ResetPerson>`
		select user_id as "userId", tenant_id as "tenantId", display_name as "displayName", locale, email
		from ops.mfa_reset_operator(${email})`.execute(db);
	return rows[0];
}

// no queue in the cli, and the demo outbox belongs to the sandboxes, so only live mode mails
export async function mailReset(config: Config, person: ResetPerson): Promise<boolean> {
	if (config.APP_MODE !== 'live') return false;

	await new ResendTransport(config.RESEND_API_KEY!, config.MAIL_FROM!).send({
		tenantId: person.tenantId,
		to: person.email,
		...mfaResetMail(person.locale, { name: person.displayName })
	});
	return true;
}
