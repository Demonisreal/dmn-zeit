import { fromAbsolute, parseDate, toCalendarDate } from '@internationalized/date';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, type LinkProps } from '@tanstack/react-router';
import { hasRole, type Role, type WorkspaceKind } from '@zeit/shared';
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
	stepsIn,
	useTourMarks,
	type TourStep
} from './tour';

const doneAs = {
	request: 'employee',
	approve: 'team_lead',
	restFinding: 'employee',
	close: 'hr',
	invoice: 'freelancer'
} as const satisfies Record<TourStep, Role | 'freelancer'>;

const stepPage = {
	request: '/absences',
	approve: '/inbox',
	restFinding: '/',
	close: '/hr/months',
	invoice: '/billing'
} as const satisfies Record<TourStep, LinkProps['to']>;

type Props = {
	role: Role;
	workspace: WorkspaceKind;
	expiresAt: string;
};

export function DemoTour({ role, workspace, expiresAt }: Props) {
	const { t } = useTranslation('demo');
	const [open, setOpen] = useState(isTourOpen);
	const marks = useTourMarks();
	const steps = stepsIn[workspace];

	const created = Date.parse(expiresAt) - 24 * 3_600_000;
	const today = parseDate(todayIso());
	const month = shiftMonth(
		toCalendarDate(fromAbsolute(created, 'Europe/Berlin')).toString().slice(0, 7),
		-1
	);

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
	const requested = absences.some(
		(absence) => absence.type === 'vacation' && since(absence.createdAt)
	);
	const approved = absences.some(
		(absence) => absence.status === 'approved' && since(absence.decidedAt)
	);
	const closed = checklist.data?.closed === true;
	const seen: Partial<Record<TourStep, boolean>> = {
		request: requested,
		approve: approved,
		close: closed
	};

	useEffect(() => {
		if (requested) markTourStep('request');
		if (approved) markTourStep('approve');
		if (closed) markTourStep('close');
	}, [requested, approved, closed]);

	const done = steps.filter((step) => seen[step] || marks.includes(step));
	const reachable = (step: TourStep) =>
		step === 'invoice' ? workspace === 'solo' : hasRole(role, doneAs[step]);

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
					{t('tour.progress', { done: done.length, total: steps.length })}
				</span>
			</button>
			{open && (
				<ol id="demo-tour" className={styles.tour} aria-label={t('tour.label')}>
					{steps.map((step) => (
						<li key={step} data-done={done.includes(step) || undefined}>
							<span className={styles.tick} aria-hidden="true" />
							<span>
								{reachable(step) ? (
									<Link to={stepPage[step]}>{t(`tour.steps.${step}`)}</Link>
								) : (
									t(`tour.steps.${step}`)
								)}
								<VisuallyHidden>
									, {t(done.includes(step) ? 'tour.done' : 'tour.open')}
								</VisuallyHidden>
							</span>{' '}
							<span className={styles.as}>{t(`tour.as.${doneAs[step]}`)}</span>
						</li>
					))}
				</ol>
			)}
			{open && workspace === 'company' && <p className={styles.soloHint}>{t('tour.solo')}</p>}
		</>
	);
}
