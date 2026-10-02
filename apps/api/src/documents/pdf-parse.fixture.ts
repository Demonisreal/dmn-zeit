import parse from 'pdf-parse/lib/pdf-parse.js';

// the package root runs a debug demo when required without a module.parent (as vitest does)
// pdf.js 1.10 ignores byteOffset and reads a pooled Buffer from the start of its ArrayBuffer
export const pdfParse = (pdf: Buffer, options?: Parameters<typeof parse>[1]) => parse(new Uint8Array(pdf), options);
