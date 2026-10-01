import { join } from 'node:path';

// fixed path only, never a path from invoice data (threat model I-05)
const FONT_DIR = join(__dirname, '../../assets/fonts');

export const REGULAR_FONT = join(FONT_DIR, 'DejaVuSans.ttf');
export const BOLD_FONT = join(FONT_DIR, 'DejaVuSans-Bold.ttf');
