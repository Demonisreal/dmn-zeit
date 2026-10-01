import { useLocation, useNavigate } from '@tanstack/react-router';
import { tokenSchema } from '@zeit/shared';
import { useEffect, useState } from 'react';

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

	useEffect(() => {
		if (hash) void navigate({ to: '.', hash: '', replace: true });
	}, [hash, navigate]);

	return fragment;
}
