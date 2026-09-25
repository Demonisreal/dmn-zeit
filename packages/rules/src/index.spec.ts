import { describe, expect, it } from 'vitest';
import * as rules from './index';

const functions = [
	'fraction',
	'parseDecimal',
	'toDecimal',
	'roundDiv',
	'percentOf',
	'parseCents',
	'workdayOf',
	'splitByLocalDate',
	'monthDays',
	'wholeMinutes',
	'gapsBetween',
	'summarizeWorkday',
	'easterSunday',
	'holidaysFor',
	'contractOn',
	'targetMinutes',
	'ruleSetFor',
	'groupShifts',
	'checkShifts',
	'dayBalance',
	'accountBalance',
	'applyCap',
	'annualEntitlement',
	'daysForRange',
	'allocate',
	'expiryDecision',
	'sickRefund',
	'roundMinutes',
	'roundingFor',
	'resolveRate',
	'isBillable',
	'aggregate',
	'linesFromCells',
	'vatRateFor',
	'taxTreatment',
	'invoiceTotals',
	'negateLines',
	'isSmallAmountInvoice',
	'smallBusinessCheck',
	'invoiceForm',
	'budgetStatus',
	'projectCoverage',
	'timerHint'
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
