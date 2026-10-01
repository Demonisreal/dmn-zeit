import type { Employee } from '@zeit/shared';
import { z } from 'zod';
import { employeeOptions } from '../../hr/people/employee-options';

export const noEmployee = 'none';

export const employeeField = z.string().transform((id) => (id === noEmployee ? null : id));

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
