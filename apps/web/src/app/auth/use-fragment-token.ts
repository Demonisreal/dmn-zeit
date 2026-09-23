import { useLocation, useNavigate } from '@tanstack/react-router';
import { tokenSchema } from '@zeit/shared';
import { useEffect, useState } from 'react';

// invite and reset links carry the token as #t=..., the fragment never reaches a server log
export function useFragmentToken() {
	const hash = useLocation({ select: (location) => location.hash });
	const navigate = useNavigate();
	const [fragment] = useState(() => {
		const raw = new URLSearchParams(hash).get('t');
		return {
			present: raw !== null,
			token: raw !== null && tokenSchema.safeParse(raw).success ? raw : null
		};
	});

	// the token opens the account, it should not stay in the address bar or the history
	useEffect(() => {
		if (hash) void navigate({ to: '.', hash: '', replace: true });
	}, [hash, navigate]);

	return fragment;
}
