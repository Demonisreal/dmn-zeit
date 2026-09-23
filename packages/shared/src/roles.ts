import { z } from 'zod';

export const roles = ['employee', 'team_lead', 'hr', 'admin'] as const;
export type Role = (typeof roles)[number];

export const roleSchema = z.enum(roles);

// roles form a ladder, each one may do everything the ones below it may
export function hasRole(role: Role, required: Role): boolean {
	return roles.indexOf(role) >= roles.indexOf(required);
}
