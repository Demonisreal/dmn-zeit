// first match wins: chrome also sends Safari/, edge and opera also send Chrome/
const browsers: [RegExp, string][] = [
	[/Edg(A|iOS)?\//, 'Edge'],
	[/OPR\//, 'Opera'],
	[/Firefox\/|FxiOS\//, 'Firefox'],
	[/Chrome\/|CriOS\//, 'Chrome'],
	[/Safari\//, 'Safari']
];

const systems: [RegExp, string][] = [
	[/iPhone|iPad/, 'iOS'],
	[/Android/, 'Android'],
	[/Windows/, 'Windows'],
	[/Mac OS X/, 'macOS'],
	[/Linux/, 'Linux']
];

export function describeAgent(userAgent: string | null) {
	const pick = (list: [RegExp, string][]) =>
		userAgent ? list.find(([pattern]) => pattern.test(userAgent))?.[1] : undefined;
	return { browser: pick(browsers), os: pick(systems) };
}
