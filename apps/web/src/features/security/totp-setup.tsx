import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { mfaTotpSchema, type TotpSetup as Setup } from '@zeit/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/field';
import { confirmTotp, startTotpSetup } from '../../lib/api/auth';
import { hasCode } from '../../lib/api/errors';
import { CopyButton } from './copy-button';
import { ErrorNotice } from './error-notice';
import { ReauthDialog } from './reauth-dialog';
import styles from './security.module.css';

type Props = {
	onConfirmed: (recoveryCodes: string[]) => void;
};

// as a data url the svg stays an image and never becomes markup in the page
const svgImage = (svg: string) =>
	`data:image/svg+xml;base64,${btoa(Array.from(new TextEncoder().encode(svg), (byte) => String.fromCharCode(byte)).join(''))}`;

export function TotpSetup({ onConfirmed }: Props) {
	const { t } = useTranslation('security');
	const start = useMutation({ mutationFn: startTotpSetup });

	if (start.data) {
		return <TotpConfirm setup={start.data} onConfirmed={onConfirmed} onCancel={start.reset} />;
	}
	return (
		<>
			<div className={styles.actions}>
				<Button isPending={start.isPending} onPress={() => start.mutate()}>
					{t('totp.setup')}
				</Button>
			</div>
			{start.error && (
				<ErrorNotice error={start.error} texts={{ INVALID_STATE: t('totp.already') }} />
			)}
		</>
	);
}

type ConfirmProps = Props & {
	setup: Setup;
	onCancel: () => void;
};

function TotpConfirm({ setup, onConfirmed, onCancel }: ConfirmProps) {
	const { t } = useTranslation('security');
	const { control, handleSubmit, setError } = useForm({
		resolver: zodResolver(mfaTotpSchema),
		defaultValues: { code: '' }
	});

	const confirm = useMutation({
		mutationFn: confirmTotp,
		onSuccess: ({ recoveryCodes }) => onConfirmed(recoveryCodes),
		onError: (err) => {
			// the api answers a code that does not match with a validation error on the field
			if (hasCode(err, 'VALIDATION')) setError('code', { message: t('totp.wrong') });
		}
	});
	const submit = handleSubmit((input) => confirm.mutate(input));

	return (
		<>
			<form noValidate className={styles.flow} onSubmit={submit}>
				<p>{t('totp.scan')}</p>
				<img
					className={styles.qr}
					src={svgImage(setup.qrSvg)}
					alt={t('totp.qrAlt')}
					width={176}
					height={176}
				/>
				<p className={styles.text}>{t('totp.manual')}</p>
				<div className={styles.secret}>
					<code>{setup.secret.match(/.{4}/g)?.join(' ')}</code>
					<CopyButton text={setup.secret} label={t('copy')} />
				</div>
				<FormField
					control={control}
					name="code"
					label={t('totp.code')}
					inputMode="numeric"
					autoComplete="one-time-code"
				/>
				{confirm.error && !hasCode(confirm.error, 'VALIDATION') && (
					<ErrorNotice error={confirm.error} />
				)}
				<div className={styles.actions}>
					<Button type="submit" variant="primary" isPending={confirm.isPending}>
						{t('totp.confirm')}
					</Button>
					<Button variant="quiet" isDisabled={confirm.isPending} onPress={onCancel}>
						{t('cancel')}
					</Button>
				</div>
			</form>
			{/* outside the form: react lets submit events bubble through portals into it */}
			<ReauthDialog
				isOpen={hasCode(confirm.error, 'REAUTH_REQUIRED')}
				onClose={confirm.reset}
				onConfirmed={submit}
			/>
		</>
	);
}
