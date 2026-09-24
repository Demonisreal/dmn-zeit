import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
	ApiError,
	Contract,
	CreateContractInput,
	CreateEmployeeInput,
	Employee,
	EmployeeExitInput,
	EmployeesQuery,
	UpdateEmployeeInput
} from '@zeit/shared';
import { sql, type InferResult, type Selectable } from 'kysely';
import { assertCanSee } from '../common/scope';
import type { AuthSession } from '../common/session.guard';
import { Database, type Trx } from '../db/database';
import type { AppContracts } from '../db/schema.generated';
import { minutesOf } from './work-models.service';

// the same day the contract policy compares with
export const today = sql<string>`(now() at time zone 'Europe/Berlin')::date`;

function selectEmployees(trx: Trx) {
	return (
		trx
			.selectFrom('app.employees as e')
			// team leads may not read the users of others, for them the link stays empty
			.leftJoin('app.users as u', 'u.employee_id', 'e.id')
			.select([
				'e.id',
				'e.personnel_no',
				'e.first_name',
				'e.last_name',
				'e.team_id',
				'u.id as user_id',
				'e.entry_date',
				'e.exit_date',
				'e.closed_through'
			])
	);
}

type EmployeeRow = InferResult<ReturnType<typeof selectEmployees>>[number];

function toEmployee(row: EmployeeRow): Employee {
	return {
		id: row.id,
		personnelNo: row.personnel_no,
		firstName: row.first_name,
		lastName: row.last_name,
		teamId: row.team_id,
		userId: row.user_id,
		entryDate: row.entry_date,
		exitDate: row.exit_date,
		closedThrough: row.closed_through
	};
}

function toContract(row: Selectable<AppContracts>): Contract {
	return {
		id: row.id,
		employeeId: row.employee_id,
		validFrom: row.valid_from,
		workModelId: row.work_model_id,
		minutes: minutesOf(row),
		vacationDaysYear: row.vacation_days_year,
		vacationBasisDays: row.vacation_basis_days,
		flexCapPlusMinutes: row.flex_cap_plus_min,
		flexCapMinusMinutes: row.flex_cap_minus_min,
		createdAt: row.created_at
	};
}

@Injectable()
export class EmployeesService {
	constructor(private readonly db: Database) {}

	async list(session: AuthSession, query: EmployeesQuery): Promise<Employee[]> {
		const rows = await this.db.withTenant(session, (trx) =>
			selectEmployees(trx)
				.$if(!!query.team, (qb) => qb.where('e.team_id', '=', query.team!))
				// leaving at the end of the month means still here until that day is over
				.$if(!query.includeExited, (qb) =>
					qb.where((eb) => eb.or([eb('e.exit_date', 'is', null), eb('e.exit_date', '>=', today)]))
				)
				.orderBy('e.last_name')
				.orderBy('e.first_name')
				.execute()
		);
		return rows.map(toEmployee);
	}

	create(session: AuthSession, input: CreateEmployeeInput): Promise<Employee> {
		return this.db.withTenant(session, async (trx) => {
			const { id } = await trx
				.insertInto('app.employees')
				.values({
					tenant_id: session.tenantId,
					personnel_no: input.personnelNo,
					first_name: input.firstName,
					last_name: input.lastName,
					team_id: input.teamId,
					entry_date: input.entryDate
				})
				.returning('id')
				.executeTakeFirstOrThrow();
			await this.insertContract(trx, session.tenantId, id, {
				...input.contract,
				validFrom: input.entryDate
			});
			return this.read(trx, id);
		});
	}

	get(session: AuthSession, id: string): Promise<Employee> {
		return this.db.withTenant(session, async (trx) => {
			await assertCanSee(trx, session, id);
			return this.read(trx, id);
		});
	}

	update(session: AuthSession, id: string, input: UpdateEmployeeInput): Promise<Employee> {
		return this.db.withTenant(session, async (trx) => {
			if (Object.keys(input).length > 0) {
				await trx
					.updateTable('app.employees')
					.set({
						personnel_no: input.personnelNo,
						first_name: input.firstName,
						last_name: input.lastName,
						team_id: input.teamId
					})
					.where('id', '=', id)
					.execute();
			}
			return this.read(trx, id);
		});
	}

	exit(session: AuthSession, id: string, input: EmployeeExitInput): Promise<Employee> {
		return this.db.withTenant(session, async (trx) => {
			await trx
				.updateTable('app.employees')
				.set({ exit_date: input.exitDate })
				.where('id', '=', id)
				.execute();
			return this.read(trx, id);
		});
	}

	contracts(session: AuthSession, employeeId: string): Promise<Contract[]> {
		return this.db.withTenant(session, async (trx) => {
			await this.mustExist(trx, employeeId);
			const rows = await trx
				.selectFrom('app.contracts')
				.selectAll()
				.where('employee_id', '=', employeeId)
				.orderBy('valid_from')
				.execute();
			return rows.map(toContract);
		});
	}

	addContract(
		session: AuthSession,
		employeeId: string,
		input: CreateContractInput
	): Promise<Contract> {
		return this.db.withTenant(session, async (trx) => {
			await this.mustExist(trx, employeeId);
			return toContract(await this.insertContract(trx, session.tenantId, employeeId, input));
		});
	}

	removeContract(session: AuthSession, employeeId: string, contractId: string): Promise<void> {
		return this.db.withTenant(session, async (trx) => {
			// row security only lets contracts go that have not started, the one from the entry date stays
			const { numDeletedRows } = await trx
				.deleteFrom('app.contracts as c')
				.where('c.id', '=', contractId)
				.where('c.employee_id', '=', employeeId)
				.where('c.valid_from', '>', (eb) =>
					eb
						.selectFrom('app.employees as e')
						.select('e.entry_date')
						.whereRef('e.id', '=', 'c.employee_id')
				)
				.executeTakeFirst();
			if (numDeletedRows > 0n) return;

			const contract = await trx
				.selectFrom('app.contracts')
				.select('id')
				.where('id', '=', contractId)
				.where('employee_id', '=', employeeId)
				.executeTakeFirst();
			if (!contract) throw new NotFoundException('Contract not found');
			throw new ConflictException({
				code: 'INVALID_STATE',
				message: 'Only a later contract that has not started yet can be removed',
				details: null
			} satisfies ApiError);
		});
	}

	private async read(trx: Trx, id: string): Promise<Employee> {
		const row = await selectEmployees(trx).where('e.id', '=', id).executeTakeFirst();
		if (!row) throw new NotFoundException('Employee not found');
		return toEmployee(row);
	}

	private async mustExist(trx: Trx, id: string): Promise<void> {
		const employee = await trx
			.selectFrom('app.employees')
			.select('id')
			.where('id', '=', id)
			.executeTakeFirst();
		if (!employee) throw new NotFoundException('Employee not found');
	}

	private async insertContract(
		trx: Trx,
		tenantId: string,
		employeeId: string,
		input: CreateContractInput
	): Promise<Selectable<AppContracts>> {
		const model = await trx
			.selectFrom('app.work_models')
			.select(['min_mon', 'min_tue', 'min_wed', 'min_thu', 'min_fri', 'min_sat', 'min_sun'])
			.where('id', '=', input.workModelId)
			.where('archived_at', 'is', null)
			.executeTakeFirst();
		if (!model) {
			throw new ConflictException({
				code: 'INVALID_STATE',
				message: 'The work model does not exist or is archived',
				details: null
			} satisfies ApiError);
		}

		return trx
			.insertInto('app.contracts')
			.values({
				tenant_id: tenantId,
				employee_id: employeeId,
				valid_from: input.validFrom,
				work_model_id: input.workModelId,
				...model,
				vacation_days_year: input.vacationDaysYear,
				vacation_basis_days: input.vacationBasisDays,
				flex_cap_plus_min: input.flexCapPlusMinutes,
				flex_cap_minus_min: input.flexCapMinusMinutes
			})
			.returningAll()
			.executeTakeFirstOrThrow();
	}
}
