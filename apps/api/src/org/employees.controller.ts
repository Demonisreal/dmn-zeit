import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
	createContractSchema,
	createEmployeeSchema,
	employeeExitSchema,
	employeesQuerySchema,
	updateEmployeeSchema,
	uuidSchema
} from '@zeit/shared';
import type {
	Contract,
	CreateContractInput,
	CreateEmployeeInput,
	Employee,
	EmployeeExitInput,
	EmployeesQuery,
	UpdateEmployeeInput
} from '@zeit/shared';
import { CurrentSession } from '../common/current-session.decorator';
import { Roles } from '../common/roles.guard';
import type { AuthSession } from '../common/session.guard';
import { Workspace } from '../common/workspace.guard';
import { ZodPipe } from '../common/zod.pipe';
import { EmployeesService } from './employees.service';

const id = new ZodPipe(uuidSchema);

@Roles('hr')
@Controller('employees')
@Workspace('company')
export class EmployeesController {
	constructor(private readonly employees: EmployeesService) {}

	@Get()
	list(
		@CurrentSession() session: AuthSession,
		@Query(new ZodPipe(employeesQuerySchema)) query: EmployeesQuery
	): Promise<Employee[]> {
		return this.employees.list(session, query);
	}

	@Post()
	create(
		@CurrentSession() session: AuthSession,
		@Body(new ZodPipe(createEmployeeSchema)) body: CreateEmployeeInput
	): Promise<Employee> {
		return this.employees.create(session, body);
	}

	// the person and their team lead too, the service checks which one it is
	@Get(':id')
	@Roles('employee')
	get(
		@CurrentSession() session: AuthSession,
		@Param('id', id) employeeId: string
	): Promise<Employee> {
		return this.employees.get(session, employeeId);
	}

	@Patch(':id')
	update(
		@CurrentSession() session: AuthSession,
		@Param('id', id) employeeId: string,
		@Body(new ZodPipe(updateEmployeeSchema)) body: UpdateEmployeeInput
	): Promise<Employee> {
		return this.employees.update(session, employeeId, body);
	}

	@Post(':id/exit')
	@HttpCode(200)
	exit(
		@CurrentSession() session: AuthSession,
		@Param('id', id) employeeId: string,
		@Body(new ZodPipe(employeeExitSchema)) body: EmployeeExitInput
	): Promise<Employee> {
		return this.employees.exit(session, employeeId, body);
	}

	@Get(':id/contracts')
	contracts(
		@CurrentSession() session: AuthSession,
		@Param('id', id) employeeId: string
	): Promise<Contract[]> {
		return this.employees.contracts(session, employeeId);
	}

	@Post(':id/contracts')
	addContract(
		@CurrentSession() session: AuthSession,
		@Param('id', id) employeeId: string,
		@Body(new ZodPipe(createContractSchema)) body: CreateContractInput
	): Promise<Contract> {
		return this.employees.addContract(session, employeeId, body);
	}

	@Delete(':id/contracts/:cid')
	@HttpCode(204)
	async removeContract(
		@CurrentSession() session: AuthSession,
		@Param('id', id) employeeId: string,
		@Param('cid', id) contractId: string
	) {
		await this.employees.removeContract(session, employeeId, contractId);
	}
}
