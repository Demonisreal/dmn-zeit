import { createFileRoute } from '@tanstack/react-router';
import { ResetPage } from '../app/auth/reset-form';
import { PublicLayout } from '../app/public-layout';

export const Route = createFileRoute('/reset')({
	staticData: { title: 'reset' },
	component: () => (
		<PublicLayout>
			<ResetPage />
		</PublicLayout>
	)
});
