import { useTranslation } from 'react-i18next';
import { SectionNav } from '../hr/ui/section-nav';

export function AdminNav() {
	const { t } = useTranslation('admin');
	return (
		<SectionNav
			label={t('nav.label')}
			entries={[
				{ to: '/admin', label: t('nav.users'), exact: true },
				{ to: '/admin/tenant', label: t('nav.tenant') }
			]}
		/>
	);
}
