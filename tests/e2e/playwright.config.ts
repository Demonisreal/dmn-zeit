import { defineConfig, devices } from '@playwright/test';

// compose.test.yml only publishes the web port, the api sits behind its caddy proxy
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

export default defineConfig({
	testDir: 'src/tests',
	globalSetup: './src/global-setup.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	...(process.env.CI ? { workers: 2 } : {}),
	reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'html',
	timeout: 30_000,
	expect: { timeout: 5_000 },
	use: {
		baseURL,
		locale: 'de-DE',
		timezoneId: 'Europe/Berlin',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure'
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{
			name: 'mobile',
			use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
			grep: /@mobile/
		}
	]
});
