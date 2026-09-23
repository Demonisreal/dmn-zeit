import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { requireRole } from '../../../app/require-role';

export const Route = createFileRoute('/_app/team/calendar')({
	beforeLoad: ({ context }) => requireRole(context.session, 'team_lead'),
	staticData: { title: 'teamCalendar' },
	component: TeamCalendarPage
});

function TeamCalendarPage() {
	const { t } = useTranslation('nav');
	return <h1>{t('teamCalendar')}</h1>;
}
