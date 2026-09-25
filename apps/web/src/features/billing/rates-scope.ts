import type { Rate, Task } from '@zeit/shared';
import type { RateScope } from './api';

export type RatesScope =
	| { kind: 'default' }
	| { kind: 'client'; clientId: string }
	| { kind: 'project'; clientId: string; projectId: string; tasks: Task[] };

// each page lists only its own level, the more general rates show on the page above
export const own = (scope: RatesScope) => (rate: Rate) =>
	scope.kind === 'default'
		? rate.clientId === null && rate.employeeId === null
		: scope.kind === 'client'
			? rate.projectId === null
			: true;

export const queryScope = (scope: RatesScope): RateScope =>
	scope.kind === 'default'
		? {}
		: scope.kind === 'client'
			? { client: scope.clientId }
			: { project: scope.projectId };
