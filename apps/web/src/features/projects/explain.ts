import type { Explanation } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { formatCents, formatDate, formatMinutes } from '../../i18n/format';

// the keys @zeit/rules writes for rounding, rates and budgets, each one needs a text in projects.json
const known = [
	'billing.rounding.up',
	'billing.rounding.nearest',
	'billing.rounding.down',
	'billing.rate.task_employee',
	'billing.rate.task',
	'billing.rate.project_employee',
	'billing.rate.project',
	'billing.rate.client_employee',
	'billing.rate.client',
	'billing.rate.employee',
	'billing.rate.default',
	'billing.budget.ok',
	'billing.budget.warn',
	'billing.budget.exceeded'
] as const;

const isKnown = (key: string): key is (typeof known)[number] =>
	(known as readonly string[]).includes(key);

// raw and rounded carry minutes without saying so in their names
const minuteParams = new Set(['raw', 'rounded', 'usedMinutes', 'budgetMinutes']);

export function useExplain() {
	const { t, i18n } = useTranslation('projects');
	const lng = i18n.language;
	return ({ key, params }: Explanation) => {
		// a rule newer than this build still shows up, only without wording
		if (!isKnown(key)) return key;
		const values = Object.fromEntries(
			Object.entries(params).map(([name, raw]) => {
				if (minuteParams.has(name)) return [name, formatMinutes(Number(raw))];
				if (name === 'cents') return [name, formatCents(String(raw), lng)];
				if (name === 'validFrom') return [name, formatDate(String(raw), lng)];
				return [name, raw];
			})
		);
		return t(`explain.${key}`, values);
	};
}
