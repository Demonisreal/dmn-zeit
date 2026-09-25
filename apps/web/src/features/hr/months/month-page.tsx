import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { hasRole, type MonthChecklist, type Role } from '@zeit/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { Notice } from '../../../components/ui/notice';
import { Loading, LoadError } from '../../../components/ui/states';
import { Tag } from '../../../components/ui/tag';
import { formatDate, formatMinutes, formatMonth } from '../../../i18n/format';
import { hasCode } from '../../../lib/api/errors';
import { checklistQuery, closeMonth } from '../api';
import { lastDayOf } from '../dates';
import { useErrorText } from '../error-text';
import { HrNav } from '../hr-nav';
import styles from '../ui/page.module.css';
import { Checklist } from './checklist';
import { ReopenDialog } from './reopen-dialog';

type Props = {
	month: string;
	role: Role;
};

export function MonthPage({ month, role }: Props) {
	const { t, i18n } = useTranslation('hr');
	const errorText = useErrorText();
	const queryClient = useQueryClient();
	const [closing, setClosing] = useState(false);
	const [reopening, setReopening] = useState(false);
	const checklist = useQuery(checklistQuery(month));
	const name = formatMonth(month, i18n.language);
	const lastDay = formatDate(lastDayOf(month), i18n.language);

	const capList = (caps: MonthChecklist['capPreview']) =>
		new Intl.ListFormat(i18n.language).format(
			caps.map(({ employee, forfeitedMinutes }) =>
				t('months.capEntry', {
					name: employee.name,
					detail: t(forfeitedMinutes > 0 ? 'months.capForfeited' : 'months.capForgiven', {
						minutes: formatMinutes(Math.abs(forfeitedMinutes))
					})
				})
			)
		);

	const close = useMutation({
		mutationFn: () => closeMonth(month),
		onSuccess: async () => {
			setClosing(false);
			await queryClient.invalidateQueries({ queryKey: ['months'] });
			await queryClient.invalidateQueries({ queryKey: ['employees'] });
		}
	});

	let closeProblem: string | undefined;
	if (hasCode(close.error, 'INVALID_STATE')) closeProblem = t('months.closeOrder');
	else if (close.error) closeProblem = errorText(close.error);

	let body;
	if (checklist.isError) {
		body = <LoadError error={checklist.error} onRetry={() => void checklist.refetch()} />;
	} else if (!checklist.data) {
		body = <Loading rows={5} />;
	} else {
		const { closed, closable, items } = checklist.data;
		let closeHint = t('months.closable');
		if (items.some((item) => item.blocking)) closeHint = t('months.blocked');
		else if (!closable) closeHint = t('months.notClosable');
		body = (
			<>
				{closed && close.data && (
					<Notice tone="success">
						{t('months.closedThrough', { date: lastDay })}{' '}
						{close.data.capped.length > 0
							? t('months.cappedList', { list: capList(close.data.capped) })
							: t('months.cappedNone')}
					</Notice>
				)}
				<Checklist checklist={checklist.data} />
				<section className={styles.section} aria-labelledby="month-action">
					<h2 id="month-action">{closed ? t('months.reopen') : t('months.close')}</h2>
					{closed ? (
						<>
							<p className={styles.lead}>{t('months.reopenLead')}</p>
							<div className={styles.actions}>
								<Button
									variant="secondary"
									isDisabled={!hasRole(role, 'admin')}
									aria-describedby="reopen-hint"
									onPress={() => setReopening(true)}
								>
									{t('months.reopen')}
								</Button>
								<p id="reopen-hint" className={`${styles.small} ${styles.muted}`}>
									{hasRole(role, 'admin') ? t('months.reopenAudit') : t('months.reopenAdminOnly')}
								</p>
							</div>
						</>
					) : (
						<>
							<p className={styles.lead}>{t('months.closeLead', { date: lastDay })}</p>
							<div className={styles.actions}>
								<Button
									variant="primary"
									isDisabled={!closable}
									aria-describedby="close-hint"
									onPress={() => setClosing(true)}
								>
									{t('months.close')}
								</Button>
								<p id="close-hint" className={`${styles.small} ${styles.muted}`}>
									{closeHint}
								</p>
							</div>
						</>
					)}
				</section>
			</>
		);
	}

	return (
		<>
			<HrNav />
			<div className={styles.page}>
				<p className={styles.small}>
					<Link to="/hr/months">{t('months.back')}</Link>
				</p>
				<header className={styles.head}>
					<div>
						<h1>{t('months.detailTitle', { month: name })}</h1>
						{checklist.data && (
							<p className={styles.lead}>
								{checklist.data.closed ? (
									<Tag tone="success">{t('months.closed')}</Tag>
								) : (
									<Tag>{t('months.open')}</Tag>
								)}
							</p>
						)}
					</div>
				</header>
				{body}
			</div>
			<ConfirmDialog
				isOpen={closing}
				onClose={() => {
					setClosing(false);
					close.reset();
				}}
				title={t('months.closeTitle', { month: name })}
				confirmLabel={t('months.close')}
				onConfirm={() => close.mutate()}
				isPending={close.isPending}
				error={closeProblem && <Notice tone="error">{closeProblem}</Notice>}
			>
				<p>{t('months.closeText', { date: lastDay })}</p>
				{checklist.data && (
					<p>
						{checklist.data.capPreview.length > 0
							? t('months.capPreview', { list: capList(checklist.data.capPreview) })
							: t('months.capNone')}
					</p>
				)}
				<p>{t('months.closeReopenHint')}</p>
			</ConfirmDialog>
			<ReopenDialog month={month} isOpen={reopening} onClose={() => setReopening(false)} />
		</>
	);
}
