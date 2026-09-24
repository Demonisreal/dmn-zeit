import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Notice } from '../../components/ui/notice';
import { AbsenceForm } from './absence-form';
import { AbsenceList, type AbsenceListFilter } from './absence-list';
import page from './ui/page.module.css';

export type AbsencesSearch = Partial<AbsenceListFilter> & { start?: string | undefined };

type Props = AbsenceListFilter & {
	employeeId: string | null;
	start: string | undefined;
	onSearch: (next: AbsencesSearch) => void;
};

export function AbsencesPage({ employeeId, start, year, type, status, onSearch }: Props) {
	const { t } = useTranslation('absences');
	const [open, setOpen] = useState(start !== undefined);
	const [done, setDone] = useState<string | null>(null);
	const toggle = useRef<HTMLButtonElement>(null);

	const close = () => {
		setOpen(false);
		if (start) onSearch({ start: undefined });
		toggle.current?.focus();
	};

	if (!employeeId) {
		return (
			<div className={page.page}>
				<header className={page.head}>
					<h1>{t('title')}</h1>
				</header>
				<Notice>{t('errors.noEmployee')}</Notice>
			</div>
		);
	}

	return (
		<div className={page.page}>
			<header className={page.head}>
				<h1>{t('title')}</h1>
				<Button
					ref={toggle}
					variant={open ? 'secondary' : 'primary'}
					aria-expanded={open}
					aria-controls="absence-form"
					onPress={() => {
						if (open) return close();
						setDone(null);
						setOpen(true);
					}}
				>
					{t('new')}
				</Button>
			</header>
			{done && <Notice tone="success">{done}</Notice>}
			{open && (
				<AbsenceForm
					employeeId={employeeId}
					start={start}
					onClose={close}
					onCreated={(message) => {
						setDone(message);
						close();
					}}
				/>
			)}
			<AbsenceList year={year} type={type} status={status} onFilter={onSearch} />
		</div>
	);
}
