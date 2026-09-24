import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { forgotPasswordSchema } from '@zeit/shared';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/field';
import { Notice } from '../../components/ui/notice';
import { forgotPassword, resetPassword } from '../../lib/api/auth';
import { hasCode } from '../../lib/api/errors';
import { errorKey } from '../error-key';
import styles from './auth.module.css';
import { LinkInvalid } from './link-invalid';
import { newPasswordSchema, rejectsPassword } from './new-password';
import { useFragmentToken } from './use-fragment-token';

export function ResetPage() {
	const { t } = useTranslation('auth');
	const { present, token } = useFragmentToken();
	// the route stays the same, so asking for a new link switches the view instead of navigating
	const [requesting, setRequesting] = useState(false);

	if (!present || requesting) return <ForgotForm />;

	const invalid = (
		<LinkInvalid
			text={t('reset.invalid')}
			action={
				<Button variant="secondary" onPress={() => setRequesting(true)}>
					{t('reset.requestNew')}
				</Button>
			}
		/>
	);
	return token ? <NewPasswordForm token={token} invalid={invalid} /> : invalid;
}

function ForgotForm() {
	const { t } = useTranslation(['auth', 'common']);
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(forgotPasswordSchema),
		defaultValues: { email: '' }
	});
	const request = useMutation({ mutationFn: forgotPassword });

	if (request.isSuccess) {
		return (
			<div className={styles.form}>
				<h1>{t('reset.requestTitle')}</h1>
				<Notice tone="success">{t('reset.requestSent')}</Notice>
				<p>
					<Link to="/login">{t('backToLogin')}</Link>
				</p>
			</div>
		);
	}

	return (
		<form
			className={styles.form}
			noValidate
			onSubmit={handleSubmit((input) => request.mutate(input))}
		>
			<h1>{t('reset.requestTitle')}</h1>
			<p className={styles.intro}>{t('reset.requestIntro')}</p>
			<FormField
				control={control}
				name="email"
				label={t('email')}
				type="email"
				autoComplete="email"
			/>
			{request.error && <Notice tone="error">{t(errorKey(request.error))}</Notice>}
			<div className={styles.actions}>
				<Button type="submit" variant="primary" isPending={request.isPending}>
					{t('reset.requestSubmit')}
				</Button>
				<Link to="/login">{t('backToLogin')}</Link>
			</div>
		</form>
	);
}

type NewPasswordProps = {
	token: string;
	invalid: ReactNode;
};

function NewPasswordForm({ token, invalid }: NewPasswordProps) {
	const { t } = useTranslation(['auth', 'common']);
	const navigate = useNavigate();
	const { control, handleSubmit, setError } = useForm({
		resolver: zodResolver(newPasswordSchema),
		defaultValues: { password: '', confirm: '' }
	});

	const reset = useMutation({
		mutationFn: resetPassword,
		onSuccess: () => navigate({ to: '/login', search: { notice: 'passwordReset' }, replace: true }),
		onError: (err) => {
			if (rejectsPassword(err))
				setError('password', { message: t('common:validation.password.common') });
		}
	});

	if (hasCode(reset.error, 'TOKEN_INVALID')) return invalid;

	return (
		<form
			className={styles.form}
			noValidate
			onSubmit={handleSubmit(({ password }) => reset.mutate({ token, password }))}
		>
			<h1>{t('reset.title')}</h1>
			<FormField
				control={control}
				name="password"
				label={t('newPassword')}
				description={t('passwordRule')}
				type="password"
				autoComplete="new-password"
			/>
			<FormField
				control={control}
				name="confirm"
				label={t('confirmPassword')}
				type="password"
				autoComplete="new-password"
			/>
			{reset.error && !rejectsPassword(reset.error) && (
				<Notice tone="error">{t(errorKey(reset.error))}</Notice>
			)}
			<div className={styles.actions}>
				<Button type="submit" variant="primary" isPending={reset.isPending}>
					{t('reset.submit')}
				</Button>
			</div>
		</form>
	);
}
