import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
	capMinutesSchema,
	federalStates,
	flexCapModes,
	optionalHolidays,
	updateTenantSchema,
	type Tenant,
	type UpdateTenantInput
} from '@zeit/shared';
import { CheckboxGroup, Label, Text } from 'react-aria-components';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { FormField } from '../../../components/ui/field';
import { Notice } from '../../../components/ui/notice';
import { FormSelect } from '../../../components/ui/select-field';
import { durationText, optionalDurationField } from '../../hr/duration';
import { useErrorText } from '../../hr/error-text';
import page from '../../hr/ui/page.module.css';
import { tenantQuery, updateTenant } from '../api';
import css from './tenant-form.module.css';

const styles = css as Record<'group' | 'label' | 'options' | 'cap', string>;
const fields = updateTenantSchema.required().shape;

// people type 31.03., the api stores 03-31
const carryover = z.string().transform((text) => {
	const match = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(text.trim());
	return match ? `${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}` : text;
});

const schema = z.object({
	name: fields.name,
	state: fields.state,
	holidayOptions: fields.holidayOptions,
	halfDaysDec24And31: fields.halfDaysDec24And31,
	flexCapMode: fields.flexCapMode,
	flexCapPlusMinutes: optionalDurationField.pipe(capMinutesSchema.nullable()),
	flexCapMinusMinutes: optionalDurationField.pipe(capMinutesSchema.nullable()),
	carryoverUntil: carryover.pipe(fields.carryoverUntil)
});

const defaults = (tenant: Tenant) => ({
	name: tenant.name,
	state: tenant.state,
	holidayOptions: tenant.holidayOptions,
	halfDaysDec24And31: tenant.halfDaysDec24And31,
	flexCapMode: tenant.flexCapMode,
	flexCapPlusMinutes:
		tenant.flexCapPlusMinutes === null ? '' : durationText(tenant.flexCapPlusMinutes),
	flexCapMinusMinutes:
		tenant.flexCapMinusMinutes === null ? '' : durationText(tenant.flexCapMinusMinutes),
	carryoverUntil: `${tenant.carryoverUntil.slice(3)}.${tenant.carryoverUntil.slice(0, 2)}.`
});

export function TenantForm({ tenant }: { tenant: Tenant }) {
	const { t } = useTranslation('admin');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const { control, handleSubmit, reset } = useForm({
		resolver: zodResolver(schema),
		defaultValues: defaults(tenant)
	});

	const save = useMutation({
		mutationFn: (input: UpdateTenantInput) => updateTenant(input),
		onSuccess: async (saved) => {
			reset(defaults(saved));
			queryClient.setQueryData(tenantQuery.queryKey, saved);
			await queryClient.invalidateQueries({ queryKey: ['holidays'] });
		}
	});

	return (
		<form
			className={page.section}
			noValidate
			aria-label={t('tenant.title')}
			onSubmit={handleSubmit((input) => save.mutate(input))}
		>
			<div className={page.fields}>
				<FormField control={control} name="name" label={t('tenant.name')} />
				<FormSelect
					control={control}
					name="state"
					label={t('tenant.state')}
					description={t('tenant.stateHint')}
					options={federalStates.map((state) => ({ id: state, label: t(`states.${state}`) }))}
				/>
			</div>

			<Controller
				control={control}
				name="holidayOptions"
				render={({ field }) => (
					<CheckboxGroup
						value={field.value}
						onChange={field.onChange}
						onBlur={field.onBlur}
						className={styles.group}
					>
						<Label className={styles.label}>{t('tenant.optionalHolidays')}</Label>
						<Text slot="description" className={`${page.small} ${page.muted}`}>
							{t('tenant.optionalHolidaysHint')}
						</Text>
						<div className={styles.options}>
							{optionalHolidays.map((holiday) => (
								<Checkbox key={holiday} value={holiday}>
									{t(`holidays.${holiday}`)}{' '}
									<span className={`${page.small} ${page.muted}`}>
										{t(`tenant.optionalWhere.${holiday}`)}
									</span>
								</Checkbox>
							))}
						</div>
					</CheckboxGroup>
				)}
			/>

			<Controller
				control={control}
				name="halfDaysDec24And31"
				render={({ field }) => (
					<Checkbox isSelected={field.value} onChange={field.onChange} onBlur={field.onBlur}>
						{t('tenant.halfDays')}
					</Checkbox>
				)}
			/>

			<fieldset className={styles.cap}>
				<legend className={styles.label}>{t('tenant.cap')}</legend>
				<p className={`${page.small} ${page.muted}`}>{t('tenant.capHint')}</p>
				<div className={page.fields}>
					<FormSelect
						control={control}
						name="flexCapMode"
						label={t('tenant.capMode')}
						options={flexCapModes.map((mode) => ({
							id: mode,
							label: t(`tenant.capModes.${mode}`)
						}))}
					/>
					<FormField
						control={control}
						name="flexCapPlusMinutes"
						label={t('tenant.capPlus')}
						description={t('tenant.capEmpty')}
					/>
					<FormField
						control={control}
						name="flexCapMinusMinutes"
						label={t('tenant.capMinus')}
						description={t('tenant.capEmpty')}
					/>
				</div>
			</fieldset>

			<div className={page.fields}>
				<FormField
					control={control}
					name="carryoverUntil"
					label={t('tenant.carryover')}
					description={t('tenant.carryoverHint')}
				/>
			</div>

			{save.isSuccess && <Notice tone="success">{t('tenant.saved')}</Notice>}
			{save.error && <Notice tone="error">{errorText(save.error)}</Notice>}
			<div className={page.actions}>
				<Button type="submit" variant="primary" isPending={save.isPending}>
					{t('save')}
				</Button>
			</div>
		</form>
	);
}
