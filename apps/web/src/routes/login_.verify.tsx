import { createFileRoute, Navigate } from '@tanstack/react-router';
import { mfaMethods } from '@zeit/shared';
import { z } from 'zod';
import { nextPath } from '../app/auth/next-path';
import { PublicLayout } from '../app/public-layout';
import { VerifyForm } from '../features/security/verify-form';
import { i18n } from '../i18n';

export const Route = createFileRoute('/login_/verify')({
	validateSearch: z.object({
		next: nextPath,
		methods: z.array(z.enum(mfaMethods)).min(1).optional().catch(undefined)
	}),
	loader: () => i18n.loadNamespaces('security'),
	staticData: { title: 'verify' },
	component: VerifyPage
});

function VerifyPage() {
	const { next, methods } = Route.useSearch();
	if (!methods) return <Navigate to="/login" search={{ next }} replace />;
	return (
		<PublicLayout>
			<VerifyForm methods={methods} next={next} />
		</PublicLayout>
	);
}
