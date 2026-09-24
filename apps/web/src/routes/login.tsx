import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { LoginForm } from '../app/auth/login-form';
import { nextPath } from '../app/auth/next-path';
import { PublicLayout } from '../app/public-layout';
import { sessionQuery } from '../lib/api/auth';

const searchSchema = z.object({
	next: nextPath,
	notice: z.enum(['passwordSet', 'passwordReset']).optional().catch(undefined)
});

export const Route = createFileRoute('/login')({
	validateSearch: searchSchema,
	beforeLoad: async ({ context }) => {
		if (await context.queryClient.ensureQueryData(sessionQuery)) throw redirect({ to: '/' });
	},
	staticData: { title: 'login' },
	component: LoginPage
});

function LoginPage() {
	const { next, notice } = Route.useSearch();
	return (
		<PublicLayout>
			<LoginForm next={next} notice={notice} />
		</PublicLayout>
	);
}
