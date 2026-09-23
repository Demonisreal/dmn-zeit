import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { logout, sessionQuery } from '../lib/api/auth';

export function useSignOut() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	return useMutation({
		mutationFn: logout,
		onSuccess: async () => {
			queryClient.removeQueries();
			queryClient.setQueryData(sessionQuery.queryKey, null);
			await navigate({ to: '/login' });
		}
	});
}
