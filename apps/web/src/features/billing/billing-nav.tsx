import { useTranslation } from 'react-i18next';
import { SectionNav } from '../hr/ui/section-nav';

// invoices, time report and settings join in stage 10d
export function BillingNav() {
	const { t } = useTranslation('billing');
	return (
		<SectionNav
			label={t('nav.label')}
			entries={[{ to: '/billing/clients', label: t('nav.clients'), match: '/billing/projects' }]}
		/>
	);
}
