import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Clock, ClockState } from '@zeit/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../app/error-key';
import { Button } from '../../components/ui/button';
import { Notice } from '../../components/ui/notice';
import { Skeleton } from '../../components/ui/skeleton';
import { formatMinutes, formatTime } from '../../i18n/format';
import { hasCode } from '../../lib/api/errors';
import { clockKey, clockQuery, stamp, type ClockAction } from './api';
import styles from './clock-panel.module.css';
import { minutesSince, useNow } from './use-now';

const actions: Record<ClockState, { primary: ClockAction; secondary?: ClockAction }> = {
	off: { primary: 'in' },
	working: { primary: 'out', secondary: 'break' },
	on_break: { primary: 'resume', secondary: 'out' }
};

const liveMinutes = (clock: Clock, readAt: number, now: number) =>
	clock.state === 'working' ? clock.workedMinutes + minutesSince(readAt, now) : clock.workedMinutes;

function advance(clock: Clock, action: ClockAction, workedMinutes: number): Clock {
	const base = { workday: clock.workday, workedMinutes };
	const since = new Date().toISOString();
	if (action === 'break') return { state: 'on_break', ...base, since };
	if (action === 'out') return { state: 'off', ...base };
	return { state: 'working', ...base, entryId: crypto.randomUUID(), since };
}

export function ClockPanel() {
	const { t, i18n } = useTranslation(['week', 'common']);
	const queryClient = useQueryClient();
	const clock = useQuery(clockQuery);
	const now = useNow(clock.data?.state === 'working');
	const [refused, setRefused] = useState<unknown>(null);

	const press = useMutation({
		mutationFn: stamp,
		onMutate: async (action) => {
			setRefused(null);
			await queryClient.cancelQueries({ queryKey: clockKey });
			const before = queryClient.getQueryData<Clock>(clockKey);
			const readAt = queryClient.getQueryState(clockKey)?.dataUpdatedAt ?? Date.now();
			if (before) {
				queryClient.setQueryData(
					clockKey,
					advance(before, action, liveMinutes(before, readAt, Date.now()))
				);
			}
			return { before, readAt };
		},
		onError: (err, _action, context) => {
			if (context?.before) {
				queryClient.setQueryData(clockKey, context.before, { updatedAt: context.readAt });
			}
			setRefused(err);
		},
		onSettled: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: clockKey }),
				queryClient.invalidateQueries({ queryKey: ['days'] }),
				queryClient.invalidateQueries({ queryKey: ['flex'] })
			])
	});

	if (clock.isPending) {
		return (
			<div className={styles.panel} aria-busy="true">
				<Skeleton width="6rem" height="2.5rem" />
				<Skeleton width="7rem" height="2.5rem" />
			</div>
		);
	}

	if (clock.isError) {
		return (
			<div className={styles.panel}>
				<p className={styles.failed}>{t('clock.loadFailed')}</p>
				<Button variant="secondary" onPress={() => void clock.refetch()}>
					{t('common:retry')}
				</Button>
			</div>
		);
	}

	const state = clock.data;
	const { primary, secondary } = actions[state.state];
	const run = (action: ClockAction) => {
		if (!press.isPending) press.mutate(action);
	};

	return (
		<div className={styles.wrap}>
			<div
				className={styles.panel}
				role="group"
				aria-label={t('clock.label')}
				aria-busy={press.isPending || undefined}
			>
				<p className={styles.time}>
					<span className={styles.today}>{t('clock.today')}</span>
					<span className={styles.minutes}>
						{formatMinutes(liveMinutes(state, clock.dataUpdatedAt, now))}
					</span>
					<span className={styles.state} data-state={state.state} aria-live="polite">
						{state.state === 'off'
							? t('clock.off')
							: t(state.state === 'working' ? 'clock.working' : 'clock.onBreak', {
									time: formatTime(state.since, i18n.language)
								})}
					</span>
				</p>
				<div className={styles.buttons}>
					{secondary && (
						<Button variant="secondary" onPress={() => run(secondary)}>
							{t(`clock.${secondary}`)}
						</Button>
					)}
					<Button variant="primary" onPress={() => run(primary)}>
						{t(`clock.${primary}`)}
					</Button>
				</div>
			</div>
			{refused !== null && (
				<Notice tone="error">
					{hasCode(refused, 'INVALID_STATE') ? t('clock.changed') : t(errorKey(refused))}
				</Notice>
			)}
		</div>
	);
}
