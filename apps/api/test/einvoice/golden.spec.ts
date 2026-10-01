import { describe, expect, it } from 'vitest';
import { renderXRechnung, renderZugferd } from '../../src/einvoice/einvoice';
import { embeddedInvoice, FIXTURES, minimalPdf } from './fixtures';

// kosit.sh validates exactly these files, a changed mapping has to pass the validator again
const golden = (name: string) => `./golden/${name}.xml`;

describe.each(Object.entries(FIXTURES))('%s', (name, invoice) => {
	it('matches the XRechnung golden file', async () => {
		await expect(await renderXRechnung(invoice)).toMatchFileSnapshot(golden(`${name}.xrechnung`));
	});

	it('embeds the Factur-X golden file into the pdf', async () => {
		const document = await renderZugferd(invoice, await minimalPdf());
		await expect(embeddedInvoice(document)).toMatchFileSnapshot(golden(`${name}.facturx`));
	});
});
