import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
	ApiError,
	CreateTeamInput,
	Team,
	TeamLeadsInput,
	UpdateTeamInput
} from '@zeit/shared';
import { sql } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import type { AuthSession } from '../common/session.guard';
import { Database, type Trx } from '../db/database';
import { today } from './employees.service';

function selectTeams(trx: Trx) {
	return trx.selectFrom('app.teams as t').select((eb) => [
		't.id',
		't.name',
		jsonArrayFrom(
			eb
				.selectFrom('app.team_leads as l')
				.innerJoin('app.users as u', 'u.id', 'l.user_id')
				.select(['u.id', 'u.display_name as displayName'])
				.whereRef('l.team_id', '=', 't.id')
				.orderBy('u.display_name')
		).as('leads'),
		eb
			.selectFrom('app.employees as e')
			.select(sql<number>`count(*)::int`.as('count'))
			.whereRef('e.team_id', '=', 't.id')
			.where((eb) => eb.or([eb('e.exit_date', 'is', null), eb('e.exit_date', '>=', today)]))
			.$asScalar()
			.as('memberCount')
	]);
}

@Injectable()
export class TeamsService {
	constructor(private readonly db: Database) {}

	list(session: AuthSession): Promise<Team[]> {
		return this.db.withTenant(session, (trx) => selectTeams(trx).orderBy('t.name').execute());
	}

	create(session: AuthSession, input: CreateTeamInput): Promise<Team> {
		return this.db.withTenant(session, async (trx) => {
			const team = await trx
				.insertInto('app.teams')
				.values({ tenant_id: session.tenantId, name: input.name })
				.returning(['id', 'name'])
				.executeTakeFirstOrThrow();
			return { ...team, leads: [], memberCount: 0 };
		});
	}

	update(session: AuthSession, id: string, input: UpdateTeamInput): Promise<Team> {
		return this.db.withTenant(session, async (trx) => {
			if (input.name !== undefined) {
				await trx.updateTable('app.teams').set({ name: input.name }).where('id', '=', id).execute();
			}
			return this.read(trx, id);
		});
	}

	setLeads(session: AuthSession, id: string, input: TeamLeadsInput): Promise<Team> {
		return this.db.withTenant(session, async (trx) => {
			const team = await trx
				.selectFrom('app.teams')
				.select('id')
				.where('id', '=', id)
				.forUpdate()
				.executeTakeFirst();
			if (!team) throw new NotFoundException('Team not found');

			await trx.deleteFrom('app.team_leads').where('team_id', '=', id).execute();
			if (input.userIds.length > 0) {
				const leads = await trx
					.selectFrom('app.users')
					.select('id')
					.where('id', 'in', input.userIds)
					.where('role', '>=', 'team_lead')
					.execute();
				if (leads.length < input.userIds.length) {
					throw new ConflictException({
						code: 'INVALID_STATE',
						message: 'Every lead has to be a user of this tenant with at least the team lead role',
						details: null
					} satisfies ApiError);
				}
				await trx
					.insertInto('app.team_leads')
					.values(
						input.userIds.map((userId) => ({
							tenant_id: session.tenantId,
							team_id: id,
							user_id: userId
						}))
					)
					.execute();
			}
			return this.read(trx, id);
		});
	}

	private async read(trx: Trx, id: string): Promise<Team> {
		const team = await selectTeams(trx).where('t.id', '=', id).executeTakeFirst();
		if (!team) throw new NotFoundException('Team not found');
		return team;
	}
}
