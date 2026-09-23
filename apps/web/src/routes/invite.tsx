import { createFileRoute } from '@tanstack/react-router';
import { InvitePage } from '../app/auth/invite-form';
import { PublicLayout } from '../app/public-layout';

export const Route = createFileRoute('/invite')({
	staticData: { title: 'invite' },
	component: () => (
		<PublicLayout>
			<InvitePage />
		</PublicLayout>
	)
});
