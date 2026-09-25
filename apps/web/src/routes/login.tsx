import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { LoginForm } from '../app/auth/login-form';
import { nextPath } from '../app/auth/next-path';
import { PublicLayout } from '../app/public-layout';
import { DemoStart } from '../features/demo/demo-start';
import { i18n } from '../i18n';
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
	loader: async ({ context }) => {
		await context.queryClient.prefetchQuery(configQuery);
		const demo = context.queryClient.getQueryData(configQuery.queryKey)?.mode === 'demo';
		// a failed passkey on the normal form speaks with the security texts
		await i18n.loadNamespaces(demo ? 'demo' : 'security');
	},
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
