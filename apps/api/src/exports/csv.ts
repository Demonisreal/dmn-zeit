export type Cell = string | number;

const FORMULA = /^[=+\-@\t\r]/;
const SIGNED_DECIMAL = /^-?\d+([.,]\d+)?$/;

function cell(raw: Cell, separator: string): string {
	if (typeof raw === 'number') return String(raw);
	const text = FORMULA.test(raw) && !SIGNED_DECIMAL.test(raw) ? `'${raw}` : raw;
	return text.includes(separator) || /["\r\n]/.test(text)
		? `"${text.replaceAll('"', '""')}"`
		: text;
}

export function toCsv(rows: readonly (readonly Cell[])[], separator: ';' | ','): string {
	const lines = rows.map((row) => row.map((raw) => cell(raw, separator)).join(separator));
	return `\uFEFF${lines.join('\r\n')}\r\n`;
}
