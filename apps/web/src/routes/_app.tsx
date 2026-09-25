import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Navigate, Outlet, redirect } from '@tanstack/react-router';
import type { Session } from '@zeit/shared';
import { AppShell } from '../app/app-shell';
import { i18n } from '../i18n';
import { sessionQuery } from '../lib/api/auth';

// only a fresh session answer sets the language, a failed profile save must not flip it back later
const applied = new WeakSet<Session>();

export const Route = createFileRoute('/_app')({
	beforeLoad: async ({ context, location }) => {
		const session = await context.queryClient.ensureQueryData(sessionQuery);
		if (!session) {
			throw redirect({
				to: '/login',
				search: location.href === '/' ? {} : { next: location.href }
			});
		}
		if (session.security.enrollmentPending) throw redirect({ to: '/security/setup' });
		// set before the first render, otherwise the page flashes in the browser language
		if (!applied.has(session)) {
			applied.add(session);
			await i18n.changeLanguage(session.user.locale);
		}
		return { session };
	},
	// the start page already explains its numbers with the hr texts, so they come with the shell
	loader: ({ context }) =>
		i18n.loadNamespaces(context.session.mode === 'demo' ? ['hr', 'demo'] : 'hr'),
	component: AppLayout
});

function AppLayout() {
	const { data: session } = useQuery(sessionQuery);
	if (!session) return <Navigate to="/login" />;
	return (
		<AppShell session={session}>
			<Outlet />
		</AppShell>
	);
}
