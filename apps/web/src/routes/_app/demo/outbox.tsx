import { createFileRoute, redirect } from '@tanstack/react-router';
import { OutboxPage } from '../../../features/demo/outbox-page';

export const Route = createFileRoute('/_app/demo/outbox')({
	// outside the demo the api has no outbox, every call would end in 404
	beforeLoad: ({ context }) => {
		if (context.session.mode !== 'demo') throw redirect({ to: '/' });
	},
	component: OutboxPage
});
