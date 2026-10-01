import { useEffect, useState } from 'react';

export function useNow(running: boolean, every = 15_000) {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		if (!running) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), every);
		return () => clearInterval(timer);
	}, [running, every]);
	return now;
}

export const minutesSince = (from: number, now: number) =>
	Math.floor(Math.max(0, now - from) / 60_000);
