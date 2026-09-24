import { useEffect, useState } from 'react';

// a running clock only shows whole minutes, a few seconds late is fine
export function useNow(every = 15_000) {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), every);
		return () => clearInterval(timer);
	}, [every]);
	return now;
}

export const minutesSince = (from: number, now: number) =>
	Math.floor(Math.max(0, now - from) / 60_000);
