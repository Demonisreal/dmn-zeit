import { hasRole, type Role } from '@zeit/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Notice } from '../../components/ui/notice';
import page from '../absences/ui/page.module.css';
import { AbsenceRequests } from './absence-requests';
import { CorrectionRequests } from './correction-requests';
import { SickNotes } from './sick-notes';

type Props = {
	role: Role;
	employeeId: string | null;
};

export function InboxPage({ role, employeeId }: Props) {
	const { t } = useTranslation('inbox');
	const [done, setDone] = useState<string | null>(null);
	return (
		<div className={page.page}>
			<header className={page.head}>
				<h1>{t('title')}</h1>
			</header>
			{done && <Notice tone="success">{done}</Notice>}
			<AbsenceRequests onDone={setDone} />
			<CorrectionRequests onDone={setDone} />
			{/* confirming a medical certificate books leave back, only hr may do that */}
			{hasRole(role, 'hr') && <SickNotes employeeId={employeeId} onDone={setDone} />}
		</div>
	);
}
