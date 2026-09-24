import type { Employee } from '@zeit/shared';
import { z } from 'zod';
import { employeeOptions } from '../../hr/people/employee-options';

// an account without a personnel record is fine, e.g. for an external payroll office
export const noEmployee = 'none';

export const employeeField = z.string().transform((id) => (id === noEmployee ? null : id));

// a record can carry one account only, so the ones already taken drop out
export const linkOptions = (
	employees: Employee[],
	lng: string,
	noneLabel: string,
	keep: string | null = null
) => [
	{ id: noEmployee, label: noneLabel },
	...employeeOptions(
		employees.filter((employee) => employee.userId === null || employee.id === keep),
		lng
	)
];
