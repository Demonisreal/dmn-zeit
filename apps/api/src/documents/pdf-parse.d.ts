// @types/pdf-parse targets the package root, tests import the lib file directly (see pdf.spec.ts)
declare module 'pdf-parse/lib/pdf-parse.js' {
	type PdfParseResult = {
		text: string;
		numpages: number;
		info: Record<string, string | undefined>;
	};
	function pdfParse(data: Buffer): Promise<PdfParseResult>;
	export default pdfParse;
}
