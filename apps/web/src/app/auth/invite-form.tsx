import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { Invitation } from '@zeit/shared';
import { useForm } from 'react-hook-form';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Field, FormField } from '../../components/ui/field';
import { Notice } from '../../components/ui/notice';
import { Skeleton } from '../../components/ui/skeleton';
import { acceptInvitation, inspectInvitation, sessionQuery } from '../../lib/api/auth';
import { hasCode } from '../../lib/api/errors';
import { errorKey } from '../error-key';
import styles from './auth.module.css';
import { LinkInvalid } from './link-invalid';
import { newPasswordSchema, rejectsPassword } from './new-password';
import { useFragmentToken } from './use-fragment-token';

const tokenRefused = (err: unknown) => hasCode(err, 'TOKEN_INVALID') || hasCode(err, 'VALIDATION');

export function InvitePage() {
	const { t } = useTranslation('auth');
	const { token } = useFragmentToken();
	return token ? <InviteCheck token={token} /> : <LinkInvalid text={t('invite.invalid')} />;
}

function InviteCheck({ token }: { token: string }) {
	const { t } = useTranslation(['auth', 'common']);
	const invitation = useQuery({
		queryKey: ['invitation', token],
		queryFn: () => inspectInvitation(token),
		retry: false,
		staleTime: Infinity
	});

	if (invitation.isPending) {
		return (
			<div className={styles.form} role="status" aria-busy="true">
				<VisuallyHidden>{t('common:loading')}</VisuallyHidden>
				<Skeleton width="60%" height="1.75rem" />
				<Skeleton width="85%" />
				<Skeleton height="2.5rem" />
				<Skeleton height="2.5rem" />
			</div>
		);
	}
	if (invitation.isError) {
		return tokenRefused(invitation.error) ? (
			<LinkInvalid text={t('invite.invalid')} />
		) : (
			<Notice tone="error">{t(errorKey(invitation.error))}</Notice>
		);
	}
	return <InviteForm token={token} invitation={invitation.data} />;
}

type FormProps = {
	token: string;
	invitation: Invitation;
};

function InviteForm({ token, invitation }: FormProps) {
	const { t } = useTranslation(['auth', 'common']);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { control, handleSubmit, setError } = useForm({
		resolver: zodResolver(newPasswordSchema),
		defaultValues: { password: '', confirm: '' }
	});

	const accept = useMutation({
		mutationFn: acceptInvitation,
		onSuccess: async (session) => {
			queryClient.setQueryData(sessionQuery.queryKey, session);
			await navigate({ to: '/security/setup', replace: true });
		},
		onError: (err) => {
			if (rejectsPassword(err))
				setError('password', { message: t('common:validation.password.common') });
		}
	});

	if (tokenRefused(accept.error) && !rejectsPassword(accept.error)) {
		return <LinkInvalid text={t('invite.invalid')} />;
	}

	return (
		<form
			className={styles.form}
			noValidate
			onSubmit={handleSubmit(({ password }) => accept.mutate({ token, password }))}
		>
			<h1>{t('invite.title')}</h1>
			<p className={styles.intro}>
				{t('invite.intro', { tenant: invitation.tenantName, name: invitation.displayName })}
			</p>
			<Field
				label={t('email')}
				type="email"
				value={invitation.email}
				autoComplete="username"
				isReadOnly
			/>
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
			{accept.error && !rejectsPassword(accept.error) && (
				<Notice tone="error">{t(errorKey(accept.error))}</Notice>
			)}
			<div className={styles.actions}>
				<Button type="submit" variant="primary" isPending={accept.isPending}>
					{t('invite.submit')}
				</Button>
			</div>
		</form>
	);
}
