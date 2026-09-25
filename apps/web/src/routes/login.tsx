import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { LoginForm } from '../app/auth/login-form';
import { nextPath } from '../app/auth/next-path';
import { PublicLayout } from '../app/public-layout';
import { DemoStart } from '../features/demo/demo-start';
import { sessionQuery } from '../lib/api/auth';
import { configQuery } from '../lib/api/demo';

const searchSchema = z.object({
	next: nextPath,
	notice: z.literal('passwordReset').optional().catch(undefined)
});

export const Route = createFileRoute('/login')({
	validateSearch: searchSchema,
	beforeLoad: async ({ context }) => {
		if (await context.queryClient.ensureQueryData(sessionQuery)) throw redirect({ to: '/' });
	},
	// prefetch never throws, without an answer the normal login shows
	loader: ({ context }) => context.queryClient.prefetchQuery(configQuery),
	staticData: { title: 'login' },
	component: LoginPage
});

function LoginPage() {
	const { next, notice } = Route.useSearch();
	const config = useQuery(configQuery);
	// the demo api has no password login, visitors get a sandbox instead
	return (
		<PublicLayout>
			{config.data?.mode === 'demo' ? <DemoStart /> : <LoginForm next={next} notice={notice} />}
		</PublicLayout>
	);
}
