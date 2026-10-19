import { useEffect, useState } from 'react';

export function useNow(running: boolean, every = 15_000) {
	const [now, setNow] = useState(Date.now);
	const [ticking, setTicking] = useState(running);
	if (running !== ticking) {
		setTicking(running);
		if (running) setNow(Date.now);
	}
	useEffect(() => {
		if (!running) return;
		const timer = setInterval(() => setNow(Date.now()), every);
		return () => clearInterval(timer);
	}, [running, every]);
	return now;
}

export const minutesSince = (from: number, now: number) =>
	Math.floor(Math.max(0, now - from) / 60_000);
