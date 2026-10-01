import { hasRole, type Role } from '@zeit/shared';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Notice } from '../../components/ui/notice';
import { Page, PageHead } from '../../components/ui/page-shell';
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
	const heading = useRef<HTMLHeadingElement>(null);
	const decided = (message: string) => {
		setDone(message);
		heading.current?.focus();
	};
	return (
		<Page>
			<PageHead>
				<h1 ref={heading} tabIndex={-1} className={page.anchor}>
					{t('title')}
				</h1>
			</PageHead>
			{done && <Notice tone="success">{done}</Notice>}
			<AbsenceRequests onDone={decided} />
			<CorrectionRequests onDone={decided} />
			{hasRole(role, 'hr') && <SickNotes employeeId={employeeId} onDone={decided} />}
		</Page>
	);
}
