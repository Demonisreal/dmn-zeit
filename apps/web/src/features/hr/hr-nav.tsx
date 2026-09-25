import { useTranslation } from 'react-i18next';
import { SectionNav } from './ui/section-nav';

export function HrNav() {
	const { t } = useTranslation('hr');
	return (
		<SectionNav
			label={t('nav.label')}
			entries={[
				{ to: '/hr', label: t('nav.people'), exact: true, match: '/hr/people' },
				// month-end work right after people and in the order it gets done, so phones see it first
				{ to: '/hr/findings', label: t('nav.findings') },
				{ to: '/hr/months', label: t('nav.months') },
				{ to: '/hr/exports', label: t('nav.exports') },
				{ to: '/hr/flex', label: t('nav.flex') },
				{ to: '/hr/notices', label: t('nav.notices') },
				{ to: '/hr/teams', label: t('nav.teams') },
				{ to: '/hr/work-models', label: t('nav.workModels') },
				{ to: '/hr/audit', label: t('nav.audit') }
			]}
		/>
	);
}
