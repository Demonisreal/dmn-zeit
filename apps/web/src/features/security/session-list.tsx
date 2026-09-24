import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActiveSession } from '@zeit/shared';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import { Notice } from '../../components/ui/notice';
import { Skeleton } from '../../components/ui/skeleton';
import { Table } from '../../components/ui/table';
import { Tag } from '../../components/ui/tag';
import { activeSessionsQuery, endSession } from '../../lib/api/auth';
import { hasCode } from '../../lib/api/errors';
import { ErrorNotice } from './error-notice';
import { formatInstant } from './format-instant';
import styles from './security.module.css';
import { describeAgent } from './user-agent';

const byRecent = (a: ActiveSession, b: ActiveSession) =>
	Number(b.current) - Number(a.current) || Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt);

export function SessionList() {
	const { t, i18n } = useTranslation(['security', 'common', 'nav']);
	const queryClient = useQueryClient();
	const sessions = useQuery(activeSessionsQuery);

	const end = useMutation({
		mutationFn: endSession,
		// already gone counts as done, the list just catches up
		onSettled: () => queryClient.invalidateQueries({ queryKey: activeSessionsQuery.queryKey })
	});

	const device = (userAgent: string | null) => {
		const { browser, os } = describeAgent(userAgent);
		if (browser && os) return t('sessions.deviceName', { browser, os });
		return browser ?? os ?? t('sessions.unknownDevice');
	};

	return (
		<div className={styles.page}>
			<header>
				<h1>{t('nav:sessions')}</h1>
				<p className={styles.lead}>{t('sessions.intro')}</p>
			</header>
			{sessions.isPending ? (
				<div className={styles.loading} role="status" aria-busy="true">
					<VisuallyHidden>{t('common:loading')}</VisuallyHidden>
					<Skeleton height="2rem" />
					<Skeleton height="2rem" />
					<Skeleton height="2rem" />
				</div>
			) : sessions.isError ? (
				<Notice
					tone="error"
					action={<Button onPress={() => void sessions.refetch()}>{t('common:retry')}</Button>}
				>
					{t(errorKey(sessions.error))}
				</Notice>
			) : (
				<>
					<div className={styles.scroll}>
						<Table label={t('sessions.list')}>
							<thead>
								<tr>
									<th>{t('sessions.device')}</th>
									<th>{t('sessions.ip')}</th>
									<th data-numeric>{t('sessions.since')}</th>
									<th data-numeric>{t('sessions.lastSeen')}</th>
									<th>
										<VisuallyHidden>{t('sessions.actions')}</VisuallyHidden>
									</th>
								</tr>
							</thead>
							<tbody>
								{sessions.data.toSorted(byRecent).map((session) => (
									<tr key={session.id} data-current={session.current || undefined}>
										<td>
											<span className={styles.title}>
												{device(session.userAgent)}
												{session.current && <Tag>{t('sessions.current')}</Tag>}
											</span>
										</td>
										<td>
											<code>{session.ip ?? '–'}</code>
										</td>
										<td data-numeric>{formatInstant(session.createdAt, i18n.language)}</td>
										<td data-numeric>{formatInstant(session.lastSeenAt, i18n.language)}</td>
										<td>
											{!session.current && (
												<div className={styles.rowActions}>
													<Button
														variant="quiet"
														aria-label={t('sessions.endLabel', {
															device: device(session.userAgent)
														})}
														isPending={end.isPending && end.variables === session.id}
														onPress={() => end.mutate(session.id)}
													>
														{t('sessions.end')}
													</Button>
												</div>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</Table>
					</div>
					{sessions.data.length === 1 && <p className={styles.text}>{t('sessions.onlyThis')}</p>}
					{end.error && !hasCode(end.error, 'NOT_FOUND') && <ErrorNotice error={end.error} />}
				</>
			)}
		</div>
	);
}
