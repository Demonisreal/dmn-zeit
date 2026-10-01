export type Cell = string | number;

// a spreadsheet runs text starting like this as a formula; numbers come from us and stay numbers
const FORMULA = /^[=+\-@\t\r]/;
// a signed decimal as text (german locale amounts) is not a formula, just a number written with a comma
const SIGNED_DECIMAL = /^-?\d+([.,]\d+)?$/;

function cell(raw: Cell, separator: string): string {
	if (typeof raw === 'number') return String(raw);
	const text = FORMULA.test(raw) && !SIGNED_DECIMAL.test(raw) ? `'${raw}` : raw;
	return text.includes(separator) || /["\r\n]/.test(text)
		? `"${text.replaceAll('"', '""')}"`
		: text;
}

// without the byte order mark excel reads utf-8 as ansi and garbles every umlaut
export function toCsv(rows: readonly (readonly Cell[])[], separator: ';' | ','): string {
	const lines = rows.map((row) => row.map((raw) => cell(raw, separator)).join(separator));
	return `\uFEFF${lines.join('\r\n')}\r\n`;
}
