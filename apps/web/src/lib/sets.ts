export const flip = (set: Set<string>, key: string) => {
	const next = new Set(set);
	if (next.has(key)) next.delete(key);
	else next.add(key);
	return next;
};
