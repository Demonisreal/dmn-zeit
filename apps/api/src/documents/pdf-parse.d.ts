// @types/pdf-parse targets the package root, tests import the lib file directly (see pdf-parse.fixture.ts)
declare module 'pdf-parse/lib/pdf-parse.js' {
	type PdfParseResult = {
		text: string;
		numpages: number;
		info: Record<string, string | undefined>;
	};
	type PdfTextItem = {
		str: string;
		width: number;
		transform: [number, number, number, number, number, number];
	};
	type PdfPage = { getTextContent(): Promise<{ items: PdfTextItem[] }> };
	function pdfParse(
		data: Uint8Array,
		options?: { pagerender?: (page: PdfPage) => Promise<string> }
	): Promise<PdfParseResult>;
	export default pdfParse;
}
