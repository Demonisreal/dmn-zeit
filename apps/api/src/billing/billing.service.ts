import { Injectable } from '@nestjs/common';
import { invoiceTotals, smallBusinessCheck, type TaxCategory } from '@zeit/rules';
import type {
	BillingProfile,
	Revenue,
	Unbilled,
	UpdateBillingProfileInput
} from '@zeit/shared';
import type { Client } from '../common/client.decorator';
import type { AuthSession } from '../common/session.guard';
import { Database } from '../db/database';
import { MailQueue } from '../mail/mail.queue';
import { MailTransport } from '../mail/mail.transport';
import { billingIbanChangedMail } from '../mail/templates';
import { BillingStore } from './billing.store';

const CHANGE_FIELDS: (keyof BillingProfile)[] = [
	'legalName',
	'street',
	'postalCode',
	'city',
	'taxNumber',
	'vatId',
	'taxProfile',
	'previousYearRevenueCents',
	'iban',
	'bic',
	'bankName',
	'contactName',
	'contactEmail',
	'contactPhone',
	'registerCourt',
	'registerNumber',
	'invoicePrefix',
	'paymentTermsDays',
	'roundingIncrementMin',
	'roundingMode',
	'defaultFormat'
];

function changedFields(before: BillingProfile, after: BillingProfile): string[] {
	return CHANGE_FIELDS.filter((field) => before[field] !== after[field]);
}

@Injectable()
export class BillingService {
	constructor(
		private readonly db: Database,
		private readonly store: BillingStore,
		private readonly mail: MailTransport,
		private readonly queue: MailQueue
	) {}

	profile(session: AuthSession): Promise<BillingProfile> {
		return this.db.withTenant(session, (trx) => this.store.profile(trx));
	}

	updateProfile(
		session: AuthSession,
		input: UpdateBillingProfileInput,
		client: Client
	): Promise<BillingProfile> {
		return this.db.withTenant(session, async (trx) => {
			const before = await this.store.profile(trx);
			const after = await this.store.upsert(trx, session.tenantId, input);
			const changed = changedFields(before, after);

			if (changed.length > 0) {
				await this.store.logEvent(trx, session, client, {
					action: 'billing_profile.updated',
					rowId: session.tenantId,
					diff: { changedFields: changed.join(',') }
				});
			}

			if (before.iban !== after.iban) {
				const admins = await this.store.admins(trx);
				const lastFour = after.iban ? after.iban.slice(-4) : null;
				this.queue.later(async () => {
					for (const admin of admins) {
						await this.mail.send({
							tenantId: session.tenantId,
							to: admin.email,
							...billingIbanChangedMail(admin.locale, { name: admin.displayName, lastFour })
						});
					}
				});
			}
			return after;
		});
	}

	unbilled(
		session: AuthSession,
		filter: { client?: string | undefined; to?: string | undefined }
	): Promise<Unbilled> {
		return this.db.withTenant(session, (trx) => this.store.unbilled(trx, filter));
	}

	revenue(session: AuthSession, year: number): Promise<Revenue> {
		return this.db.withTenant(session, async (trx) => {
			const [profile, issuedThisYearCents, draftLines] = await Promise.all([
				this.store.profile(trx),
				this.store.issuedThisYear(trx, year),
				this.store.openDraftLines(trx)
			]);
			const draftCents = invoiceTotals(
				draftLines.map((line) => ({
					netCents: line.netCents,
					taxCategory: line.taxCategory as TaxCategory,
					taxRateBp: line.taxRateBp
				}))
			).grossCents;
			const previousYearRevenueCents = profile.previousYearRevenueCents
				? BigInt(profile.previousYearRevenueCents)
				: 0n;

			const check = smallBusinessCheck({
				previousYearRevenueCents,
				issuedThisYearCents,
				draftCents,
				year
			});

			return {
				year,
				previousYearRevenueCents: String(previousYearRevenueCents),
				issuedThisYearCents: String(issuedThisYearCents),
				draftCents: String(draftCents),
				smallBusiness: check
			};
		});
	}
}
