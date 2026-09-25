import 'i18next';
import type { Resources } from '.';

declare module 'i18next' {
	interface CustomTypeOptions {
		defaultNS: 'common';
		resources: Resources;
	}
}
