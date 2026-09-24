import { createFileRoute, redirect } from '@tanstack/react-router';
import { PublicLayout } from '../app/public-layout';
import { SetupFlow } from '../features/security/setup-flow';
import { sessionQuery } from '../lib/api/auth';

export const Route = createFileRoute('/security/setup')({
	beforeLoad: async ({ context }) => {
		const session = await context.queryClient.ensureQueryData(sessionQuery);
		if (!session) throw redirect({ to: '/login' });
		if (!session.security.enrollmentPending) throw redirect({ to: '/' });
	},
	staticData: { title: 'securitySetup' },
	component: () => (
		<PublicLayout>
			<SetupFlow />
		</PublicLayout>
	)
});
