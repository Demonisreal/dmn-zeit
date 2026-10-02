import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { WorkspaceKind } from '@zeit/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Tag } from '../../components/ui/tag';
import { formatMinutes } from '../../i18n/format';
import { minutesSince, useNow } from '../week/use-now';
import { bookableQuery, timerQuery } from './api';
import { FixEndDialog, useStop } from './fix-end';
import { describeSlot } from './project-picker';
import styles from './timer-chip.module.css';

type Props = {
	workspace: WorkspaceKind;
};

export function TimerChip({ workspace }: Props) {
	const { t } = useTranslation('projects');
	const timer = useQuery(timerQuery);
	const running = timer.data?.state === 'running' ? timer.data : null;
	const bookable = useQuery({ ...bookableQuery, enabled: running !== null });
	const now = useNow(running !== null);
	const { stop, run, fixing, close } = useStop();
	const slot = running && describeSlot(bookable.data, running);
	const what = slot ? `${slot.client} · ${slot.project}` : '';

	const state = timer.data ? (running ? `${running.entryId}|${running.hint}` : 'idle') : undefined;
	const [seen, setSeen] = useState(state);
	const [said, setSaid] = useState('');
	if (state !== seen) {
		setSeen(state);
		if (seen !== undefined && state !== undefined) {
			setSaid(
				!running
					? t('chip.stopped')
					: running.hint && seen.startsWith(running.entryId)
						? t('chip.long')
						: t('chip.started', { project: what || t('timer.otherProject') })
			);
		}
	}

	return (
		<>
			<span className={styles.said} aria-live="polite">
				{said}
			</span>
			{running && (
				<div className={styles.chip} role="group" aria-label={t('chip.label')}>
					<span className={styles.state}>{t('chip.running')}</span>
					<Link
						to={workspace === 'solo' ? '/' : '/projects'}
						className={styles.what}
						title={what || undefined}
					>
						{what || t('timer.otherProject')}
					</Link>
					<span className={styles.time}>
						{formatMinutes(minutesSince(Date.parse(running.since), now))}
					</span>
					{running.hint && <Tag tone="warning">{t('chip.longTag')}</Tag>}
					<Button variant="quiet" isDisabled={stop.isPending} onPress={() => run(running)}>
						{t('timer.stop')}
					</Button>
				</div>
			)}
			<FixEndDialog fixing={fixing} projects={bookable.data ?? []} onClose={close} />
		</>
	);
}
