import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import { Notice } from '../../components/ui/notice';
import { sessionQuery } from '../../lib/api/auth';
import { createSandbox } from '../../lib/api/demo';
import { hasCode } from '../../lib/api/errors';
import styles from './demo.module.css';
import { resetTour } from './tour';

const waitSchema = z.object({ retryAfter: z.number().int().positive() });

export function DemoStart() {
	const { t, i18n } = useTranslation(['demo', 'common']);
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const start = useMutation({
		mutationFn: () => createSandbox({ locale: i18n.language === 'en' ? 'en' : 'de' }),
		onSuccess: async (session) => {
			resetTour();
			queryClient.setQueryData(sessionQuery.queryKey, session);
			await navigate({ to: '/' });
		}
	});

	const refusal = (err: Error) => {
		const full = hasCode(err, 'SANDBOX_LIMIT');
		if (!full && !hasCode(err, 'RATE_LIMITED')) return t(errorKey(err));
		const wait = waitSchema.safeParse(err.details);
		return [
			t(full ? 'start.full' : 'start.throttled'),
			wait.success
				? t('start.wait', { count: Math.ceil(wait.data.retryAfter / 60) })
				: t('start.later')
		].join(' ');
	};

	return (
		<div className={styles.start}>
			<h1>{t('start.title')}</h1>
			<p>{t('start.intro')}</p>
			<p>{t('start.roles')}</p>
			{start.error && <Notice tone="error">{refusal(start.error)}</Notice>}
			<div>
				<Button variant="primary" isPending={start.isPending} onPress={() => start.mutate()}>
					{t('start.submit')}
				</Button>
			</div>
			<p className={styles.note}>{t('start.note')}</p>
		</div>
	);
}
