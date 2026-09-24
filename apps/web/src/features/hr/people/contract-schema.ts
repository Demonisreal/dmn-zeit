import { capMinutesSchema, createContractSchema, type Contract } from '@zeit/shared';
import { z } from 'zod';
import { durationText, optionalDurationField } from '../duration';

const contract = createContractSchema.shape;

// shared by the new contract and the first contract of a new employee
export const contractShape = {
	workModelId: contract.workModelId,
	// numeric(4,1) wants a dot, a German keyboard types a comma
	vacationDaysYear: z
		.string()
		.transform((text) => text.trim().replace(',', '.'))
		.pipe(contract.vacationDaysYear),
	vacationBasisDays: z.string().transform(Number).pipe(contract.vacationBasisDays.unwrap()),
	flexCapPlusMinutes: optionalDurationField.pipe(capMinutesSchema.nullable()),
	flexCapMinusMinutes: optionalDurationField.pipe(capMinutesSchema.nullable())
};

export const newContractSchema = z.object({ validFrom: contract.validFrom, ...contractShape });

export type ContractValues = z.input<typeof newContractSchema>;

export const basisDayOptions = ['1', '2', '3', '4', '5', '6', '7'].map((id) => ({ id, label: id }));

export const contractDefaults = (current: Contract | undefined): ContractValues => ({
	validFrom: '',
	workModelId: '',
	vacationDaysYear: current?.vacationDaysYear ?? '',
	vacationBasisDays: String(current?.vacationBasisDays ?? 5),
	flexCapPlusMinutes:
		current?.flexCapPlusMinutes == null ? '' : durationText(current.flexCapPlusMinutes),
	flexCapMinusMinutes:
		current?.flexCapMinusMinutes == null ? '' : durationText(current.flexCapMinusMinutes)
});

// the contract valid on a day is the latest one that has started by then
export const contractOn = (contracts: Contract[], day: string) =>
	contracts
		.filter((c) => c.validFrom <= day)
		.sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0];
