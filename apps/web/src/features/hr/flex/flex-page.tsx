import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/empty-state';
import { Page, PageHead } from '../../../components/ui/page-shell';
import { SelectField } from '../../../components/ui/select-field';
import { Loading, LoadError } from '../../../components/ui/states';
import { formatDate, formatMinutes } from '../../../i18n/format';
import { currentYear } from '../../../lib/dates';
import { employeesQuery, flexQuery } from '../api';
import { HrNav } from '../hr-nav';
import { employeeOptions } from '../people/employee-options';
import styles from '../ui/page.module.css';
import { FlexBookingForm } from './flex-booking-form';
import { FlexBookings, FlexMonths } from './flex-tables';

type Props = {
	employeeId: string | undefined;
	year: number;
	onChange: (next: { employee?: string | undefined; year?: number | undefined }) => void;
};

export function FlexPage({ employeeId, year, onChange }: Props) {
	const { t, i18n } = useTranslation('hr');
	const [booking, setBooking] = useState(false);
	const bookingsHeading = useRef<HTMLHeadingElement>(null);
	const employees = useQuery(employeesQuery());
	const account = useQuery({ ...flexQuery(employeeId ?? '', year), enabled: !!employeeId });
	const years = [currentYear() - 1, currentYear()].map((option) => ({
		id: String(option),
		label: String(option)
	}));

	let body;
	if (!employeeId) {
		body = <EmptyState title={t('flex.choose')}>{t('flex.chooseHint')}</EmptyState>;
	} else if (account.isError) {
		body = <LoadError error={account.error} onRetry={() => void account.refetch()} />;
	} else if (!account.data) {
		body = <Loading rows={6} />;
	} else {
		const flex = account.data;
		const { plusMinutes, minusMinutes, mode } = flex.cap;
		const opening = flex.openingExplanation;
		body = (
			<>
				<dl className={styles.facts}>
					<dt>{t('flex.balanceOn', { date: formatDate(flex.asOf, i18n.language) })}</dt>
					<dd className={styles.mono}>{formatMinutes(flex.balanceMinutes, { signed: true })}</dd>
					<dt>{t('flex.opening', { year: flex.year })}</dt>
					<dd>
						<span className={styles.mono}>
							{formatMinutes(flex.openingMinutes, { signed: true })}
						</span>
						<p className={`${styles.small} ${styles.muted}`}>
							{opening.key === 'flex.opening.carryover'
								? t('explain.flex.opening.carryover', {
										minutes: formatMinutes(Number(opening.params.minutes), { signed: true })
									})
								: t('explain.flex.opening.none')}
						</p>
					</dd>
					<dt>{t('flex.cap')}</dt>
					<dd>
						{mode === 'none' || (plusMinutes === null && minusMinutes === null)
							? t('flex.capNone')
							: t('flex.capValue', {
									plus: plusMinutes === null ? '–' : formatMinutes(plusMinutes, { signed: true }),
									minus: minusMinutes === null ? '–' : formatMinutes(-minusMinutes),
									mode: t(`flex.capModes.${mode}`)
								})}
					</dd>
				</dl>

				<section className={styles.section} aria-labelledby="flex-bookings">
					<div className={styles.sectionHead}>
						<h2 id="flex-bookings" ref={bookingsHeading} tabIndex={-1} className={styles.anchor}>
							{t('flex.bookings')}
						</h2>
						{!booking && (
							<Button variant="primary" onPress={() => setBooking(true)}>
								{t('flex.new')}
							</Button>
						)}
					</div>
					{booking && (
						<FlexBookingForm
							employeeId={employeeId}
							onDone={() => {
								setBooking(false);
								bookingsHeading.current?.focus();
							}}
						/>
					)}
					<FlexBookings bookings={flex.bookings} />
				</section>

				<section className={styles.section} aria-labelledby="flex-months">
					<h2 id="flex-months">{t('flex.months')}</h2>
					<FlexMonths months={flex.months} />
				</section>
			</>
		);
	}

	return (
		<>
			<HrNav />
			<Page>
				<PageHead>
					<div>
						<h1>{t('flex.title')}</h1>
						<p className={styles.lead}>{t('flex.lead')}</p>
					</div>
				</PageHead>
				<div className={styles.filters}>
					<SelectField
						label={t('flex.employee')}
						placeholder={t('choose')}
						options={employeeOptions(employees.data ?? [], i18n.language)}
						value={employeeId ?? null}
						onChange={(key) => {
							setBooking(false);
							onChange({ employee: key === null ? undefined : String(key) });
						}}
					/>
					<SelectField
						label={t('flex.year')}
						options={years}
						value={String(year)}
						onChange={(key) => onChange({ year: Number(key) })}
					/>
				</div>
				{employees.isError && (
					<LoadError error={employees.error} onRetry={() => void employees.refetch()} />
				)}
				{body}
			</Page>
		</>
	);
}
