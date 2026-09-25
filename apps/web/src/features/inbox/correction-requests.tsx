import { parseAbsolute, toCalendarDate } from '@internationalized/date';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { Correction } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { Tag } from '../../components/ui/tag';
import { formatInstant, formatMinutes, formatTime } from '../../i18n/format';
import { approveCorrection, pendingCorrectionsQuery, rejectCorrection } from './api';
import { Decision } from './decision';
import styles from './inbox.module.css';
import { InboxSection } from './inbox-section';

type Props = {
	onDone: (message: string) => void;
};

export function CorrectionRequests({ onDone }: Props) {
	const { t } = useTranslation('inbox');
	const list = useInfiniteQuery(pendingCorrectionsQuery());
	return (
		<InboxSection
			id="inbox-corrections"
			title={t('corrections.title')}
			empty={t('corrections.empty')}
			list={list}
			items={list.data?.pages.flatMap((part) => part.items) ?? []}
		>
			{(correction) => (
				<CorrectionRequest key={correction.id} correction={correction} onDone={onDone} />
			)}
		</InboxSection>
	);
}

type RequestProps = {
	correction: Correction;
	onDone: (message: string) => void;
};

function CorrectionRequest({ correction, onDone }: RequestProps) {
	const { t, i18n } = useTranslation('inbox');
	const lng = i18n.language;
	const queryClient = useQueryClient();
	const { target, newStartedAt, newEndedAt } = correction;
	const name = correction.employee.name;
	const workday = formatInstant(target?.startedAt ?? newStartedAt ?? correction.createdAt, lng, {
		weekday: 'short',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	});

	return (
		<li className={styles.item}>
			<div className={styles.body}>
				<p className={styles.who}>{name}</p>
				<p className={styles.what}>
					<Tag>{t(`corrections.action.${correction.action}`)}</Tag>{' '}
					<span className={styles.mono}>{workday}</span>
				</p>
				<dl className={styles.change}>
					<div>
						<dt>{t('corrections.before')}</dt>
						<dd>
							{target ? (
								<TimeSpan start={target.startedAt} end={target.endedAt} />
							) : (
								t('corrections.nothing')
							)}
						</dd>
					</div>
					<div>
						<dt>{t('corrections.after')}</dt>
						<dd>
							{newStartedAt && newEndedAt ? (
								<TimeSpan start={newStartedAt} end={newEndedAt} before={target} />
							) : (
								t('corrections.removed')
							)}
						</dd>
					</div>
				</dl>
				<p className={styles.note}>
					<span className={styles.noteLabel}>{t('corrections.reason')}</span> {correction.reason}
				</p>
				<p className={styles.quiet}>
					{t('requestedAt', {
						date: formatInstant(correction.createdAt, lng, { dateStyle: 'medium' })
					})}
				</p>
			</div>
			<Decision
				label={`${name}, ${t(`corrections.action.${correction.action}`)} ${workday}`}
				onApprove={() => approveCorrection(correction.id)}
				onReject={(note) => rejectCorrection(correction.id, note)}
				onDone={async (outcome) => {
					await queryClient.invalidateQueries({ queryKey: ['corrections'] });
					onDone(t(`decided.${outcome}`, { name }));
				}}
			/>
		</li>
	);
}

const dayOf = (instant: string) => toCalendarDate(parseAbsolute(instant, 'Europe/Berlin'));
const same = (a: string | null, b: string | null) =>
	a === b || (a !== null && b !== null && Date.parse(a) === Date.parse(b));

type SpanProps = {
	start: string;
	end: string | null;
	// the state before, so the times that change stand out
	before?: Correction['target'] | undefined;
};

function TimeSpan({ start, end, before }: SpanProps) {
	const { t, i18n } = useTranslation('inbox');
	const lng = i18n.language;
	return (
		<>
			<span data-changed={(before && !same(before.startedAt, start)) || undefined}>
				{formatTime(start, lng)}
			</span>
			{' – '}
			{end ? (
				<span data-changed={(before && !same(before.endedAt, end)) || undefined}>
					{formatTime(end, lng)}
				</span>
			) : (
				<span className={styles.open}>{t('corrections.open')}</span>
			)}
			{end && dayOf(end).compare(dayOf(start)) > 0 && (
				<span className={styles.nextDay}> {t('corrections.nextDay')}</span>
			)}
			{end && (
				<span className={styles.duration}>
					{' '}
					{formatMinutes(Math.round((Date.parse(end) - Date.parse(start)) / 60_000))}
				</span>
			)}
		</>
	);
}
