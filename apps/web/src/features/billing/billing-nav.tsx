import { hasRole, type Role } from '@zeit/shared';
import { useTranslation } from 'react-i18next';
import { SectionNav } from '../hr/ui/section-nav';

type Props = {
	role: Role;
};

export function BillingNav({ role }: Props) {
	const { t } = useTranslation('billing');
	return (
		<SectionNav
			label={t('nav.label')}
			entries={[
				{ to: '/billing', label: t('nav.invoices'), exact: true, match: '/billing/invoices' },
				{ to: '/billing/clients', label: t('nav.clients'), match: '/billing/projects' },
				{ to: '/billing/reports', label: t('nav.reports') },
				...(hasRole(role, 'admin')
					? [{ to: '/billing/settings' as const, label: t('nav.settings') }]
					: [])
			]}
		/>
	);
}
