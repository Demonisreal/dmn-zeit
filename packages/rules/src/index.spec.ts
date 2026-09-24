import { describe, expect, it } from 'vitest';
import * as rules from './index';

const functions = [
	'fraction',
	'parseDecimal',
	'toDecimal',
	'workdayOf',
	'splitByLocalDate',
	'monthDays',
	'gapsBetween',
	'summarizeWorkday',
	'easterSunday',
	'holidaysFor',
	'contractOn',
	'targetMinutes',
	'ruleSetFor',
	'groupWorkdays',
	'checkWorkdays',
	'dayBalance',
	'accountBalance',
	'applyCap',
	'annualEntitlement',
	'daysForRange',
	'allocate',
	'expiryDecision',
	'sickRefund'
] as const;

describe('@zeit/rules', () => {
	it.each(functions)('exports %s', (name) => {
		expect(rules[name]).toBeTypeOf('function');
	});

	it('ships at least one rule set', () => {
		expect(rules.RULESETS.length).toBeGreaterThan(0);
		expect(rules.FEDERAL_STATES).toHaveLength(16);
	});
});
