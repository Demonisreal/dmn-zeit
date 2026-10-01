import { createFileRoute, redirect } from '@tanstack/react-router';
import { OutboxPage } from '../../../features/demo/outbox-page';

export const Route = createFileRoute('/_app/demo/outbox')({
	beforeLoad: ({ context }) => {
		if (context.session.mode !== 'demo') throw redirect({ to: '/' });
	},
	component: OutboxPage
});
