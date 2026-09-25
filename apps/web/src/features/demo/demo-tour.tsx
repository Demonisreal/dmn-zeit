import { fromAbsolute, parseDate, toCalendarDate } from '@internationalized/date';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { hasRole, type Role } from '@zeit/shared';
import { useEffect, useState } from 'react';
import { VisuallyHidden } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { absencesQuery } from '../absences/api';
import { todayIso } from '../absences/dates';
import { checklistQuery } from '../hr/api';
import { shiftMonth } from '../hr/dates';
import styles from './demo.module.css';
import {
	isTourOpen,
	keepTourOpen,
	markTourStep,
	tourSteps,
	useTourMarks,
	type TourStep
} from './tour';

const doneAs = {
	request: 'employee',
	approve: 'team_lead',
	restFinding: 'employee',
	close: 'hr'
} as const satisfies Record<TourStep, Role>;

type Props = {
	role: Role;
	expiresAt: string;
};

export function DemoTour({ role, expiresAt }: Props) {
	const { t } = useTranslation('demo');
	const [open, setOpen] = useState(isTourOpen);
	const marks = useTourMarks();

	// a sandbox lives 24 hours, so this is when it was set up
	const created = Date.parse(expiresAt) - 24 * 3_600_000;
	const today = parseDate(todayIso());
	// the seed closes through the month before last, so the month before the start is still open
	const month = shiftMonth(
		toCalendarDate(fromAbsolute(created, 'Europe/Berlin')).toString().slice(0, 7),
		-1
	);

	// the api allows 366 days, most of them ahead where leave gets booked
	const requests = useInfiniteQuery(
		absencesQuery({
			scope: hasRole(role, 'team_lead') ? 'all' : 'mine',
			from: today.subtract({ days: 60 }).toString(),
			to: today.add({ days: 300 }).toString()
		})
	);
	const checklist = useQuery({ ...checklistQuery(month), enabled: hasRole(role, 'hr') });

	const since = (at: string | null) => at !== null && Date.parse(at) > created;
	const absences = requests.data?.pages.flatMap((page) => page.items) ?? [];
	const seen: Partial<Record<TourStep, boolean>> = {
		request: absences.some((absence) => absence.type === 'vacation' && since(absence.createdAt)),
		approve: absences.some((absence) => absence.status === 'approved' && since(absence.decidedAt)),
		close: checklist.data?.closed === true
	};

	// the next persona may not see what this one saw, the tick has to outlast the switch
	useEffect(() => {
		for (const step of tourSteps) if (seen[step]) markTourStep(step);
	}, [seen.request, seen.approve, seen.close]);

	const done = tourSteps.filter((step) => seen[step] || marks.includes(step));

	const toggle = () => {
		keepTourOpen(!open);
		setOpen(!open);
	};

	return (
		<>
			<button
				type="button"
				className={styles.tourToggle}
				aria-expanded={open}
				aria-controls={open ? 'demo-tour' : undefined}
				onClick={toggle}
			>
				<span className={styles.fold} aria-hidden="true" />
				{t('tour.label')}{' '}
				<span className={styles.progress}>
					{t('tour.progress', { done: done.length, total: tourSteps.length })}
				</span>
			</button>
			{open && (
				<ol id="demo-tour" className={styles.tour} aria-label={t('tour.label')}>
					{tourSteps.map((step) => (
						<li key={step} data-done={done.includes(step) || undefined}>
							<span className={styles.tick} aria-hidden="true" />
							<span>
								{t(`tour.steps.${step}`)}
								<VisuallyHidden>
									, {t(done.includes(step) ? 'tour.done' : 'tour.open')}
								</VisuallyHidden>
							</span>{' '}
							<span className={styles.as}>{t(`tour.as.${doneAs[step]}`)}</span>
						</li>
					))}
				</ol>
			)}
		</>
	);
}
