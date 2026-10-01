import type { Employee, Team } from '@zeit/shared';
import { z } from 'zod';

type Named = Pick<Employee, 'firstName' | 'lastName'>;

export const fullName = (employee: Named) => `${employee.firstName} ${employee.lastName}`;

export const byLastName = (lng: string) => (a: Named, b: Named) =>
	a.lastName.localeCompare(b.lastName, lng) || a.firstName.localeCompare(b.firstName, lng);

export const employeeOptions = (employees: Employee[], lng: string) =>
	employees
		.toSorted(byLastName(lng))
		.map((employee) => ({ id: employee.id, label: fullName(employee) }));

export const noTeam = 'none';

export const teamField = z.string().transform((id) => (id === noTeam ? null : id));

export const teamOptions = (teams: Team[], noTeamLabel: string) => [
	{ id: noTeam, label: noTeamLabel },
	...teams.map((team) => ({ id: team.id, label: team.name }))
];
