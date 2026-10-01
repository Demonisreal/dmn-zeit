import { Injectable } from '@nestjs/common';
import { holidaysFor, type OptionalHoliday } from '@zeit/rules';
import type { Holiday, Tenant, UpdateTenantInput } from '@zeit/shared';
import type { Selectable } from 'kysely';
import type { AuthSession } from '../common/session.guard';
import { Database } from '../db/database';
import type { AppTenants } from '../db/schema.generated';

function toTenant(row: Selectable<AppTenants>): Tenant {
	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		state: row.state,
		timezone: 'Europe/Berlin',
		holidayOptions: row.holiday_options as OptionalHoliday[],
		halfDaysDec24And31: row.half_days_dec24_31,
		flexCapPlusMinutes: row.flex_cap_plus_min,
		flexCapMinusMinutes: row.flex_cap_minus_min,
		flexCapMode: row.flex_cap_mode,
		carryoverUntil: row.carryover_until,
		kind: row.kind,
		workspace: row.workspace,
		expiresAt: row.expires_at
	};
}

@Injectable()
export class TenantService {
	constructor(private readonly db: Database) {}

	async get(session: AuthSession): Promise<Tenant> {
		const row = await this.db.withTenant(session, (trx) =>
			trx
				.selectFrom('app.tenants')
				.selectAll()
				.where('id', '=', session.tenantId)
				.executeTakeFirstOrThrow()
		);
		return toTenant(row);
	}

	async update(session: AuthSession, input: UpdateTenantInput): Promise<Tenant> {
		if (Object.keys(input).length === 0) return this.get(session);

		const row = await this.db.withTenant(session, (trx) =>
			trx
				.updateTable('app.tenants')
				.set({
					name: input.name,
					state: input.state,
					holiday_options: input.holidayOptions,
					half_days_dec24_31: input.halfDaysDec24And31,
					flex_cap_plus_min: input.flexCapPlusMinutes,
					flex_cap_minus_min: input.flexCapMinusMinutes,
					flex_cap_mode: input.flexCapMode,
					carryover_until: input.carryoverUntil
				})
				.where('id', '=', session.tenantId)
				.returningAll()
				.executeTakeFirstOrThrow()
		);
		return toTenant(row);
	}

	async holidays(session: AuthSession, year: number): Promise<Holiday[]> {
		const tenant = await this.get(session);
		return holidaysFor(year, tenant.state, {
			optional: tenant.holidayOptions,
			halfDays: tenant.halfDaysDec24And31
		}).map((holiday) => ({
			date: holiday.date.toString(),
			code: holiday.code,
			portion: holiday.portion
		}));
	}
}
