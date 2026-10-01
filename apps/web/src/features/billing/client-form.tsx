import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { locales, updateClientSchema, type Client } from '@zeit/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/field';
import { Notice } from '../../components/ui/notice';
import { FormSelect } from '../../components/ui/select-field';
import { i18n } from '../../i18n';
import { useErrorText } from '../hr/error-text';
import styles from '../hr/ui/page.module.css';
import { createClient, updateClient } from './api';
import {
	blankToNull,
	incrementField,
	modeField,
	roundingDefaults,
	roundingOptions
} from './fields';
import css from './form.module.css';

const fields = updateClientSchema.required().shape;
const days = { error: () => i18n.t('billing:client.paymentRange') };

const schema = z.object({
	name: fields.name,
	number: blankToNull.pipe(fields.number),
	street: blankToNull.pipe(fields.street),
	postalCode: blankToNull.pipe(fields.postalCode),
	city: blankToNull.pipe(fields.city),
	countryCode: z
		.string()
		.transform((code) => code.trim().toUpperCase())
		.pipe(z.string().regex(/^[A-Z]{2}$/, { error: () => i18n.t('billing:client.countryInvalid') })),
	isBusiness: z.enum(['b2b', 'b2c']).transform((kind) => kind === 'b2b'),
	vatId: blankToNull.pipe(fields.vatId),
	email: blankToNull.pipe(fields.email),
	buyerReference: blankToNull.pipe(fields.buyerReference),
	invoiceLocale: fields.invoiceLocale,
	paymentTermsDays: blankToNull.pipe(
		z.string().transform(Number).pipe(z.int(days).min(0, days).max(120, days)).nullable()
	),
	roundingIncrementMin: incrementField,
	roundingMode: modeField
});

const defaults = (client: Client | undefined): z.input<typeof schema> => ({
	name: client?.name ?? '',
	number: client?.number ?? '',
	street: client?.street ?? '',
	postalCode: client?.postalCode ?? '',
	city: client?.city ?? '',
	countryCode: client?.countryCode ?? 'DE',
	isBusiness: client?.isBusiness === false ? 'b2c' : 'b2b',
	vatId: client?.vatId ?? '',
	email: client?.email ?? '',
	buyerReference: client?.buyerReference ?? '',
	invoiceLocale: client?.invoiceLocale ?? 'de',
	paymentTermsDays: client?.paymentTermsDays?.toString() ?? '',
	...roundingDefaults(client)
});

type Props = {
	client?: Client | undefined;
	onDone: (created?: Client) => void;
};

export function ClientForm({ client, onDone }: Props) {
	const { t } = useTranslation('billing');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(schema),
		defaultValues: defaults(client)
	});
	const rounding = roundingOptions(t, t('inheritGeneral'));

	const save = useMutation({
		mutationFn: async (input: z.output<typeof schema>) => {
			if (!client) return createClient(input);
			await updateClient(client.id, input);
		},
		onSuccess: async (created) => {
			await queryClient.invalidateQueries({ queryKey: ['clients'] });
			onDone(created);
		}
	});

	return (
		<form
			className={styles.panel}
			noValidate
			aria-labelledby="client-form"
			onSubmit={handleSubmit((input) => save.mutate(input))}
		>
			<h2 id="client-form">{client ? t('client.editTitle') : t('clients.new')}</h2>
			<div className={styles.fields}>
				<div className={styles.wide}>
					<div className={css.name}>
						<FormField control={control} name="name" label={t('client.name')} autoFocus />
					</div>
				</div>
				<FormField control={control} name="number" label={t('client.number')} />
				<FormField control={control} name="email" label={t('client.email')} type="email" />
			</div>

			<fieldset className={css.group}>
				<legend className={css.legend}>{t('client.address')}</legend>
				<div className={styles.fields}>
					<div className={styles.wide}>
						<div className={css.name}>
							<FormField control={control} name="street" label={t('client.street')} />
						</div>
					</div>
					<FormField control={control} name="postalCode" label={t('client.postalCode')} />
					<FormField control={control} name="city" label={t('client.city')} />
					<FormField
						control={control}
						name="countryCode"
						label={t('client.country')}
						description={t('client.countryHint')}
						maxLength={2}
					/>
				</div>
			</fieldset>

			<fieldset className={css.group}>
				<legend className={css.legend}>{t('client.invoice')}</legend>
				<div className={styles.fields}>
					<FormSelect
						control={control}
						name="isBusiness"
						label={t('client.kind')}
						options={[
							{ id: 'b2b', label: t('client.business') },
							{ id: 'b2c', label: t('client.private') }
						]}
					/>
					<FormField control={control} name="vatId" label={t('client.vatId')} />
					<FormSelect
						control={control}
						name="invoiceLocale"
						label={t('client.invoiceLocale')}
						options={locales.map((locale) => ({
							id: locale,
							label: t(`client.locales.${locale}`)
						}))}
					/>
					<FormField
						control={control}
						name="paymentTermsDays"
						label={t('client.paymentTerms')}
						description={t('client.paymentTermsHint')}
						inputMode="numeric"
					/>
					<div className={styles.wide}>
						<div className={css.name}>
							<FormField
								control={control}
								name="buyerReference"
								label={t('client.buyerReference')}
								description={t('client.buyerReferenceHint')}
							/>
						</div>
					</div>
				</div>
			</fieldset>

			<fieldset className={css.group}>
				<legend className={css.legend}>{t('rounding.title')}</legend>
				<div className={styles.fields}>
					<FormSelect
						control={control}
						name="roundingIncrementMin"
						label={t('rounding.increment')}
						options={rounding.increments}
					/>
					<FormSelect
						control={control}
						name="roundingMode"
						label={t('rounding.modeLabel')}
						options={rounding.modes}
					/>
				</div>
				<p className={`${styles.small} ${styles.muted}`}>{t('rounding.hint')}</p>
			</fieldset>

			{save.error && <Notice tone="error">{errorText(save.error)}</Notice>}
			<div className={styles.actions}>
				<Button type="submit" variant="primary" isPending={save.isPending}>
					{client ? t('save') : t('clients.new')}
				</Button>
				<Button variant="quiet" onPress={() => onDone()}>
					{t('cancel')}
				</Button>
			</div>
		</form>
	);
}
