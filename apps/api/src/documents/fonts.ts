import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// fixed path only, never a path from invoice data (threat model I-05)
const FONT_DIR = join(__dirname, '../../assets/fonts');

let regular: Buffer | undefined;
let bold: Buffer | undefined;

export function regularFont(): Buffer {
	regular ??= readFileSync(join(FONT_DIR, 'DejaVuSans.ttf'));
	return regular;
}

export function boldFont(): Buffer {
	bold ??= readFileSync(join(FONT_DIR, 'DejaVuSans-Bold.ttf'));
	return bold;
}
