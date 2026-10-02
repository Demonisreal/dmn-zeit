import { useQuery } from '@tanstack/react-query';
import type { WorkspaceKind } from '@zeit/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import { Notice } from '../../components/ui/notice';
import { Skeleton } from '../../components/ui/skeleton';
import { formatMinutes } from '../../i18n/format';
import { hasCode } from '../../lib/api/errors';
import { minutesSince, useNow } from '../week/use-now';
import { bookableQuery, startTimer, timerQuery, useProjectMutation } from './api';
import { FixEndDialog, useStop } from './fix-end';
import { describeSlot, ProjectPicker, slotKey, slotOf } from './project-picker';
import { sinceLabel } from './since';
import styles from './timer-control.module.css';

type Props = {
	workspace: WorkspaceKind;
};

export function TimerControl({ workspace }: Props) {
	const { t, i18n } = useTranslation(['projects', 'common']);
	const timer = useQuery(timerQuery);
	const bookable = useQuery(bookableQuery);
	const running = timer.data?.state === 'running' ? timer.data : null;
	const now = useNow(running !== null);
	const [picked, setPicked] = useState('');
	const start = useProjectMutation(startTimer);
	const { stop, run, fixing, close } = useStop();
	const main = workspace === 'solo' ? 'primary' : 'secondary';

	if (timer.isPending || bookable.isPending) {
		return (
			<div className={styles.panel} aria-busy="true">
				<Skeleton width="6rem" height="2.5rem" />
				<Skeleton width="16rem" height="2.5rem" />
			</div>
		);
	}

	if (timer.isError || bookable.isError) {
		return (
			<div className={styles.panel}>
				<p className={styles.failed}>{t('timer.loadFailed')}</p>
				<Button
					variant="secondary"
					onPress={() => void Promise.all([timer.refetch(), bookable.refetch()])}
				>
					{t('common:retry')}
				</Button>
			</div>
		);
	}

	if (bookable.data.length === 0) return null;

	const current = running ? slotKey(running) : '';
	const selected = picked || current;
	const label = running && describeSlot(bookable.data, running);
	const what = label && [label.client, label.project, label.task].filter(Boolean).join(' · ');
	const busy = start.isPending || stop.isPending;
	const failure = start.error ?? stop.error;

	const begin = () => {
		const { projectId, taskId } = slotOf(selected);
		start.mutate(taskId ? { projectId, taskId } : { projectId }, {
			onSuccess: () => setPicked('')
		});
	};

	return (
		<div className={styles.wrap}>
			<div
				className={styles.panel}
				role="group"
				aria-label={t('timer.label')}
				aria-busy={busy || undefined}
			>
				<p className={styles.time}>
					{running && (
						<>
							<span className={styles.what} title={what || undefined}>
								{what || t('timer.otherProject')}
							</span>
							<span className={styles.minutes}>
								{formatMinutes(minutesSince(Date.parse(running.since), now))}
							</span>
						</>
					)}
					<span
						className={styles.state}
						data-running={running ? true : undefined}
						aria-live="polite"
					>
						{running
							? t('timer.running', { since: sinceLabel(running.since, i18n.language) })
							: t('timer.idle')}
					</span>
				</p>
				<div className={styles.controls}>
					<ProjectPicker
						label={t('timer.pick')}
						projects={bookable.data}
						value={selected}
						onChange={setPicked}
						hideLabel
					/>
					{running && selected !== current && (
						<Button variant="secondary" isDisabled={busy} onPress={begin}>
							{t('timer.switch')}
						</Button>
					)}
					{running ? (
						<Button variant={main} isDisabled={busy} onPress={() => run(running)}>
							{t('timer.stop')}
						</Button>
					) : (
						<Button variant={main} isDisabled={busy || !selected} onPress={begin}>
							{t('timer.start')}
						</Button>
					)}
				</div>
			</div>
			{running?.hint && (
				<Notice tone="warning">
					{t('timer.longText', { since: sinceLabel(running.since, i18n.language) })}
				</Notice>
			)}
			{failure && (
				<Notice tone="error">
					{hasCode(failure, 'INVALID_STATE')
						? t('timer.changed')
						: hasCode(failure, 'FORBIDDEN')
							? t('timer.forbidden')
							: t(errorKey(failure))}
				</Notice>
			)}
			<FixEndDialog fixing={fixing} projects={bookable.data} onClose={close} />
		</div>
	);
}
