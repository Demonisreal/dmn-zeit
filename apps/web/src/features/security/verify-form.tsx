import { zodResolver } from '@hookform/resolvers/zod';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { mfaRecoverySchema, mfaTotpSchema, type MfaMethod } from '@zeit/shared';
import { useState, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/field';
import {
	mfaPasskeyOptions,
	sessionQuery,
	verifyMfaPasskey,
	verifyRecoveryCode,
	verifyTotp
} from '../../lib/api/auth';
import { hasCode } from '../../lib/api/errors';
import { ErrorNotice } from './error-notice';
import { signWithPasskey } from './passkey';
import css from './security.module.css';

// react-aria refuses className={undefined}, naming the classes keeps them typed as plain strings
const styles = css as Record<'flow' | 'text' | 'actions' | 'aside' | 'switch', string>;

type Factor = { method: 'totp' | 'recovery'; code: string } | { method: 'passkey' };

async function sendFactor(factor: Factor) {
	if (factor.method === 'totp') return verifyTotp({ code: factor.code });
	if (factor.method === 'recovery') return verifyRecoveryCode({ code: factor.code });
	return verifyMfaPasskey(await signWithPasskey(await mfaPasskeyOptions()));
}

// someone who typed a password most likely has no passkey at hand, recovery is the last resort
const preference: MfaMethod[] = ['totp', 'passkey', 'recovery'];

type Props = {
	methods: MfaMethod[];
	next?: string | undefined;
};

export function VerifyForm({ methods, next }: Props) {
	const { t } = useTranslation('auth');
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const usable = methods.filter((m) => m !== 'passkey' || browserSupportsWebAuthn());
	const [method, setMethod] = useState(
		() => preference.find((m) => usable.includes(m)) ?? 'passkey'
	);

	const verify = useMutation({
		mutationFn: sendFactor,
		onSuccess: async (session) => {
			queryClient.setQueryData(sessionQuery.queryKey, session);
			await navigate({ href: next ?? '/' });
		}
	});

	// the pending sign-in lives 5 minutes and 5 attempts in a cookie, after that only a restart helps
	if (hasCode(verify.error, 'UNAUTHENTICATED')) {
		return (
			<div className={styles.flow}>
				<h1>{t('verify.title')}</h1>
				<p className={styles.text}>{t('verify.expired')}</p>
				<div className={styles.actions}>
					<Link to="/login" search={{ next }}>
						{t('verify.restart')}
					</Link>
				</div>
			</div>
		);
	}

	const others = usable.filter((m) => m !== method);
	const error = verify.error && (
		<ErrorNotice
			error={verify.error}
			texts={{ INVALID_CREDENTIALS: t(`verify.${method}.wrong`) }}
		/>
	);

	return (
		<div className={styles.flow}>
			<h1>{t('verify.title')}</h1>
			<p className={styles.text}>{t(`verify.${method}.intro`)}</p>
			{method === 'passkey' ? (
				<>
					{error}
					<div className={styles.actions}>
						<Button
							variant="primary"
							autoFocus
							isPending={verify.isPending}
							onPress={() => verify.mutate({ method: 'passkey' })}
						>
							{t('verify.passkey.submit')}
						</Button>
					</div>
				</>
			) : (
				<CodeForm
					key={method}
					method={method}
					isPending={verify.isPending}
					error={error}
					onSubmit={(code) => verify.mutate({ method, code })}
				/>
			)}
			{others.length > 0 && (
				<div className={styles.aside}>
					<span>{t('verify.other')}</span>
					{others.map((m) => (
						<AriaButton
							key={m}
							className={styles.switch}
							onPress={() => {
								verify.reset();
								setMethod(m);
							}}
						>
							{t(`verify.${m}.use`)}
						</AriaButton>
					))}
				</div>
			)}
		</div>
	);
}

type CodeFormProps = {
	method: 'totp' | 'recovery';
	isPending: boolean;
	error: ReactNode;
	onSubmit: (code: string) => void;
};

function CodeForm({ method, isPending, error, onSubmit }: CodeFormProps) {
	const { t } = useTranslation('auth');
	const { control, handleSubmit } = useForm({
		resolver: zodResolver(method === 'totp' ? mfaTotpSchema : mfaRecoverySchema),
		defaultValues: { code: '' }
	});

	return (
		<form noValidate className={styles.flow} onSubmit={handleSubmit(({ code }) => onSubmit(code))}>
			<FormField
				control={control}
				name="code"
				label={t(`verify.${method}.label`)}
				description={method === 'recovery' ? t('verify.recovery.hint') : undefined}
				inputMode={method === 'totp' ? 'numeric' : 'text'}
				autoComplete={method === 'totp' ? 'one-time-code' : 'off'}
				autoFocus
			/>
			{error}
			<div className={styles.actions}>
				<Button type="submit" variant="primary" isPending={isPending}>
					{t('verify.submit')}
				</Button>
			</div>
		</form>
	);
}
