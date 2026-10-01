import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	invoicePrefixSchema,
	roundingIncrementSchema,
	updateBillingProfileSchema,
	type BillingProfile,
	type Role
} from '@zeit/shared';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/field';
import { Notice } from '../../components/ui/notice';
import { Page, PageHead } from '../../components/ui/page-shell';
import { FormSelect } from '../../components/ui/select-field';
import { Loading, LoadError } from '../../components/ui/states';
import { formatCents, listFormat } from '../../i18n/format';
import { hasCode } from '../../lib/api/errors';
import { currentYear } from '../../lib/dates';
import { useErrorText } from '../hr/error-text';
import styles from '../hr/ui/page.module.css';
import { useReauth } from '../security/reauth-dialog';
import { billingProfileQuery, revenueQuery, updateBillingProfile } from './api';
import { BillingNav } from './billing-nav';
import { blankToNull, increments } from './fields';
import css from './form.module.css';

const fields = updateBillingProfileSchema.shape;

// stored as cents, shown for editing like the rate form shows a rate: comma, two places
const centsToText = (value: string | null) =>
	value === null ? '' : (Number(value) / 100).toFixed(2).replace('.', ',');

const revenueField = z
	.string()
	.transform((text) => (text.trim() === '' ? null : text.trim()))
	.pipe(
		z
			.string()
			.regex(/^\d{1,9}(?:[.,]\d{1,2})?$/, 'format.cents')
			.transform((text) => {
				const [euros, decimals = ''] = text.replace(',', '.').split('.');
				return `${euros}${decimals.padEnd(2, '0')}`;
			})
			.nullable()
	);

const schema = z.object({
	legalName: fields.legalName,
	street: blankToNull.pipe(fields.street),
	postalCode: blankToNull.pipe(fields.postalCode),
	city: blankToNull.pipe(fields.city),
	taxNumber: blankToNull.pipe(fields.taxNumber),
	vatId: blankToNull.pipe(fields.vatId),
	taxProfile: fields.taxProfile,
	previousYearRevenueCents: revenueField,
	iban: blankToNull.pipe(fields.iban),
	bic: blankToNull.pipe(fields.bic),
	bankName: blankToNull.pipe(fields.bankName),
	contactName: blankToNull.pipe(fields.contactName),
	contactEmail: blankToNull.pipe(fields.contactEmail),
	contactPhone: blankToNull.pipe(fields.contactPhone),
	registerCourt: blankToNull.pipe(fields.registerCourt),
	registerNumber: blankToNull.pipe(fields.registerNumber),
	invoicePrefix: z
		.string()
		.transform((text) => text.trim().toUpperCase())
		.pipe(invoicePrefixSchema),
	paymentTermsDays: z.string().transform(Number).pipe(z.int().min(0).max(120)),
	roundingIncrementMin: z.string().transform(Number).pipe(roundingIncrementSchema),
	roundingMode: fields.roundingMode,
	defaultFormat: fields.defaultFormat
});

const lockedLabels = {
	legalName: 'settings.legalName',
	street: 'client.address',
	postalCode: 'client.address',
	city: 'client.address',
	contactName: 'settings.contactLegend',
	contactEmail: 'settings.contactLegend',
	contactPhone: 'settings.contactLegend',
	taxNumber: 'settings.taxNumber',
	vatId: 'client.vatId',
	iban: 'settings.bankLegend',
	bic: 'settings.bankLegend',
	bankName: 'settings.bankLegend',
	invoicePrefix: 'settings.invoicePrefix',
	paymentTermsDays: 'client.paymentTerms',
	defaultFormat: 'settings.defaultFormat',
	roundingIncrementMin: 'rounding.title',
	roundingMode: 'rounding.title'
} as const;

const isLocked = (field: string): field is keyof typeof lockedLabels => field in lockedLabels;

const lockedSchema = z.object({ fields: z.array(z.string()).min(1) });

const lockedFields = (err: Error | null) =>
	hasCode(err, 'FORBIDDEN')
		? lockedSchema.safeParse(err.details).data?.fields.filter(isLocked)
		: undefined;

const defaults = (profile: BillingProfile): z.input<typeof schema> => ({
	legalName: profile.legalName,
	street: profile.street ?? '',
	postalCode: profile.postalCode ?? '',
	city: profile.city ?? '',
	taxNumber: profile.taxNumber ?? '',
	vatId: profile.vatId ?? '',
	taxProfile: profile.taxProfile,
	previousYearRevenueCents: centsToText(profile.previousYearRevenueCents),
	iban: profile.iban ?? '',
	bic: profile.bic ?? '',
	bankName: profile.bankName ?? '',
	contactName: profile.contactName ?? '',
	contactEmail: profile.contactEmail ?? '',
	contactPhone: profile.contactPhone ?? '',
	registerCourt: profile.registerCourt ?? '',
	registerNumber: profile.registerNumber ?? '',
	invoicePrefix: profile.invoicePrefix,
	paymentTermsDays: String(profile.paymentTermsDays),
	roundingIncrementMin: String(profile.roundingIncrementMin),
	roundingMode: profile.roundingMode,
	defaultFormat: profile.defaultFormat
});

type Props = {
	role: Role;
	sandbox: boolean;
};

export function SettingsPage({ role, sandbox }: Props) {
	const { i18n } = useTranslation('billing');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const reauth = useReauth();
	const profile = useQuery(billingProfileQuery);

	if (profile.isError) {
		return (
			<>
				<BillingNav role={role} />
				<Page>
					<LoadError error={profile.error} onRetry={() => void profile.refetch()} />
				</Page>
			</>
		);
	}
	if (!profile.data) {
		return (
			<>
				<BillingNav role={role} />
				<Page>
					<Loading rows={8} />
				</Page>
			</>
		);
	}

	return (
		<SettingsForm
			role={role}
			sandbox={sandbox}
			profile={profile.data}
			onSaved={(next) => queryClient.setQueryData(billingProfileQuery.queryKey, next)}
			errorText={errorText}
			reauth={reauth}
			lng={i18n.language}
		/>
	);
}

type FormProps = {
	role: Role;
	sandbox: boolean;
	profile: BillingProfile;
	onSaved: (next: BillingProfile) => void;
	errorText: (err: unknown) => string;
	reauth: ReturnType<typeof useReauth>;
	lng: string;
};

function SettingsForm({ role, sandbox, profile, onSaved, errorText, reauth, lng }: FormProps) {
	const { t } = useTranslation('billing');
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(schema),
		defaultValues: defaults(profile)
	});
	const taxProfile = useWatch({ control, name: 'taxProfile' });
	const revenue = useQuery({ ...revenueQuery(currentYear()), enabled: taxProfile === 'small_business' });

	const save = useMutation({
		mutationFn: (input: z.output<typeof schema>) => updateBillingProfile(input),
		onSuccess: onSaved
	});
	const submit = (input: z.output<typeof schema>) =>
		save.mutate(input, { onError: reauth.onError(() => save.mutate(input)) });

	const locked = lockedFields(save.error);
	const refusal =
		locked && locked.length > 0
			? t('settings.sandboxRefused', {
					fields: listFormat(lng).format(new Set(locked.map((field) => t(lockedLabels[field]))))
				})
			: save.error && errorText(save.error);

	return (
		<>
			<BillingNav role={role} />
			<Page>
				<PageHead>
					<div>
						<h1>{t('settings.title')}</h1>
						<p className={styles.lead}>{t('settings.lead')}</p>
					</div>
				</PageHead>

				<form
					className={styles.panel}
					noValidate
					aria-labelledby="billing-settings"
					onSubmit={handleSubmit(submit)}
				>
					<h2 id="billing-settings">{t('settings.title')}</h2>
					{sandbox && <Notice tone="info">{t('settings.sandboxHint')}</Notice>}

					<div className={styles.fields}>
						<div className={styles.wide}>
							<div className={css.name}>
								<FormField
									control={control}
									name="legalName"
									label={t('settings.legalName')}
									isReadOnly={sandbox}
								/>
							</div>
						</div>
					</div>

					<fieldset className={css.group}>
						<legend className={css.legend}>{t('client.address')}</legend>
						<div className={styles.fields}>
							<div className={styles.wide}>
								<div className={css.name}>
									<FormField
										control={control}
										name="street"
										label={t('client.street')}
										isReadOnly={sandbox}
									/>
								</div>
							</div>
							<FormField
								control={control}
								name="postalCode"
								label={t('client.postalCode')}
								isReadOnly={sandbox}
							/>
							<FormField
								control={control}
								name="city"
								label={t('client.city')}
								isReadOnly={sandbox}
							/>
						</div>
					</fieldset>

					<fieldset className={css.group}>
						<legend className={css.legend}>{t('settings.contactLegend')}</legend>
						<div className={styles.fields}>
							<FormField
								control={control}
								name="contactName"
								label={t('client.name')}
								isReadOnly={sandbox}
							/>
							<FormField
								control={control}
								name="contactPhone"
								label={t('settings.phone')}
								type="tel"
								isReadOnly={sandbox}
							/>
							<FormField
								control={control}
								name="contactEmail"
								label={t('client.email')}
								type="email"
								isReadOnly={sandbox}
							/>
						</div>
						<p className={`${styles.small} ${styles.muted}`}>{t('settings.contactHint')}</p>
					</fieldset>

					<fieldset className={css.group}>
						<legend className={css.legend}>{t('settings.taxLegend')}</legend>
						<div className={styles.fields}>
							<FormField
								control={control}
								name="taxNumber"
								label={t('settings.taxNumber')}
								isReadOnly={sandbox}
							/>
							<FormField
								control={control}
								name="vatId"
								label={t('client.vatId')}
								isReadOnly={sandbox}
							/>
							<FormSelect
								control={control}
								name="taxProfile"
								label={t('settings.taxProfileLabel')}
								options={[
									{ id: 'regular', label: t('settings.taxProfiles.regular') },
									{ id: 'small_business', label: t('settings.taxProfiles.small_business') }
								]}
							/>
							{taxProfile === 'small_business' && (
								<FormField
									control={control}
									name="previousYearRevenueCents"
									label={t('settings.previousYearRevenue')}
									description={t('settings.previousYearRevenueHint')}
									inputMode="decimal"
								/>
							)}
						</div>
						{taxProfile === 'small_business' && revenue.data && (
							<Notice tone={revenue.data.smallBusiness.state === 'ok' ? 'info' : 'warning'}>
								{t(`settings.smallBusiness.${revenue.data.smallBusiness.state}`, {
									issued: formatCents(revenue.data.issuedThisYearCents, lng),
									draft: formatCents(revenue.data.draftCents, lng),
									previous: formatCents(revenue.data.previousYearRevenueCents, lng)
								})}
							</Notice>
						)}
					</fieldset>

					<fieldset className={css.group}>
						<legend className={css.legend}>{t('settings.bankLegend')}</legend>
						<div className={styles.fields}>
							<FormField
								control={control}
								name="iban"
								label={t('settings.iban')}
								autoComplete="off"
								isReadOnly={sandbox}
							/>
							<FormField
								control={control}
								name="bic"
								label={t('settings.bic')}
								isReadOnly={sandbox}
							/>
							<FormField
								control={control}
								name="bankName"
								label={t('settings.bankName')}
								isReadOnly={sandbox}
							/>
						</div>
						<p className={`${styles.small} ${styles.muted}`}>{t('settings.ibanHint')}</p>
					</fieldset>

					<fieldset className={css.group}>
						<legend className={css.legend}>{t('settings.invoiceLegend')}</legend>
						<div className={styles.fields}>
							<FormField
								control={control}
								name="invoicePrefix"
								label={t('settings.invoicePrefix')}
								description={t('settings.invoicePrefixHint')}
								isReadOnly={sandbox}
							/>
							<FormField
								control={control}
								name="paymentTermsDays"
								label={t('client.paymentTerms')}
								inputMode="numeric"
								isReadOnly={sandbox}
							/>
							<FormSelect
								control={control}
								name="defaultFormat"
								label={t('settings.defaultFormat')}
								isDisabled={sandbox}
								options={[
									{ id: 'pdf', label: t('settings.formats.pdf') },
									{ id: 'zugferd', label: t('settings.formats.zugferd') },
									{ id: 'xrechnung', label: t('settings.formats.xrechnung') }
								]}
							/>
						</div>
					</fieldset>

					<fieldset className={css.group}>
						<legend className={css.legend}>{t('rounding.title')}</legend>
						<div className={styles.fields}>
							<FormSelect
								control={control}
								name="roundingIncrementMin"
								label={t('rounding.increment')}
								isDisabled={sandbox}
								options={increments.map((minutes) => ({
									id: String(minutes),
									label: t('rounding.minutes', { minutes })
								}))}
							/>
							<FormSelect
								control={control}
								name="roundingMode"
								label={t('rounding.modeLabel')}
								isDisabled={sandbox}
								options={[
									{ id: 'up', label: t('rounding.modes.up') },
									{ id: 'nearest', label: t('rounding.modes.nearest') },
									{ id: 'down', label: t('rounding.modes.down') }
								]}
							/>
						</div>
					</fieldset>

					{refusal && <Notice tone="error">{refusal}</Notice>}
					<div className={styles.actions}>
						<Button type="submit" variant="primary" isPending={save.isPending}>
							{t('save')}
						</Button>
					</div>
				</form>
				{reauth.dialog}
			</Page>
		</>
	);
}
