import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { I18nProvider } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { tagFor } from '../i18n/format';
import type { createAppRouter } from './router';

type Props = {
	queryClient: QueryClient;
	router: ReturnType<typeof createAppRouter>;
};

export function App({ queryClient, router }: Props) {
	const { i18n } = useTranslation();
	return (
		<QueryClientProvider client={queryClient}>
			<I18nProvider locale={tagFor(i18n.language)}>
				<RouterProvider router={router} />
			</I18nProvider>
		</QueryClientProvider>
	);
}
