import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { loginSchema } from '@zeit/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/field';
import { Notice } from '../../components/ui/notice';
import { PasskeyLogin } from '../../features/security/passkey-login';
import { login, sessionQuery } from '../../lib/api/auth';
import { hasCode } from '../../lib/api/errors';
import { errorKey } from '../error-key';
import styles from './auth.module.css';

type Props = {
	next?: string | undefined;
	notice?: 'passwordReset' | undefined;
};

export function LoginForm({ next, notice }: Props) {
	const { t } = useTranslation(['auth', 'common']);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(loginSchema),
		defaultValues: { email: '', password: '' }
	});

	const signIn = useMutation({
		mutationFn: login,
		onSuccess: async (result) => {
			if ('mfaRequired' in result) {
				return navigate({ to: '/login/verify', search: { next, methods: result.methods } });
			}
			queryClient.setQueryData(sessionQuery.queryKey, result);
			await navigate({ href: next ?? '/' });
		}
	});

	return (
		<form
			className={styles.form}
			noValidate
			onSubmit={handleSubmit((input) => signIn.mutate(input))}
		>
			<h1>{t('login.title')}</h1>
			{notice && <Notice tone="success">{t(`login.${notice}`)}</Notice>}
			<FormField
				control={control}
				name="email"
				label={t('email')}
				type="email"
				autoComplete="username"
			/>
			<FormField
				control={control}
				name="password"
				label={t('password')}
				type="password"
				autoComplete="current-password"
			/>
			{signIn.error && (
				<Notice tone="error">
					{hasCode(signIn.error, 'INVALID_CREDENTIALS')
						? t('login.failed')
						: t(errorKey(signIn.error))}
				</Notice>
			)}
			<div className={styles.actions}>
				<Button type="submit" variant="primary" isPending={signIn.isPending}>
					{t('login.submit')}
				</Button>
				<Link to="/reset">{t('login.forgot')}</Link>
			</div>
			<PasskeyLogin next={next} />
			<p className={styles.aside}>{t('login.inviteOnly')}</p>
		</form>
	);
}
