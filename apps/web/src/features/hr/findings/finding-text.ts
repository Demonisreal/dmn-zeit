import type { ArbzgCode, Finding } from '@zeit/shared';
import { formatMinutes } from '../../../i18n/format';

// ARBZG_4_BREAK_SHORT -> § 4
export const paragraphOf = (code: ArbzgCode) => `§ ${code.split('_')[1]}`;

export const findingKey = (finding: Finding) =>
	`${finding.employee.id}:${finding.date}:${finding.code}`;

// the facts @zeit/rules reports, all of them minutes
export function factParams(facts: Finding['facts']) {
	const minutes = (name: string) => {
		const fact = facts[name];
		return typeof fact === 'number' ? formatMinutes(fact) : (fact ?? '');
	};
	return {
		minutes: minutes('minutes'),
		requiredMinutes: minutes('requiredMinutes'),
		actualMinutes: minutes('actualMinutes'),
		continuousMinutes: minutes('continuousMinutes'),
		restMinutes: minutes('restMinutes')
	};
}
