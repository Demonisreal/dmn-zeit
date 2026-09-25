import type {
	CreateSandboxInput,
	ErrorCode,
	Locale,
	OutboxMail,
	Persona,
	PublicConfig,
	Role,
	Session,
	SwitchPersonaInput
} from '@zeit/shared';
import { http, HttpResponse } from 'msw';
import { mockEmployees, teamIds } from './hr';
import { mockSession } from './session';

const fail = (status: number, code: Exclude<ErrorCode, 'VALIDATION'>, message: string) =>
	HttpResponse.json({ code, message, details: null }, { status });

// request() only hands the body on, so the wait goes into details as well as into Retry-After
const refuse = (
	status: 429 | 503,
	code: 'RATE_LIMITED' | 'SANDBOX_LIMIT',
	message: string,
	retryAfter: number
) =>
	HttpResponse.json(
		{ code, message, details: { retryAfter } },
		{ status, headers: { 'Retry-After': String(retryAfter) } }
	);

const done = () => new HttpResponse(null, { status: 204 });

const castAs = (lastName: string, role: Role) => {
	const employee = mockEmployees.find((e) => e.lastName === lastName)!;
	const name = `${employee.firstName} ${employee.lastName}`;
	return { userId: employee.userId!, displayName: name, role, employee: { id: employee.id, name } };
};

// one person per role from the tax office in mocks/hr.ts
const cast = [
	castAs('Brandt', 'employee'),
	castAs('Hölscher', 'team_lead'),
	castAs('Kortmann', 'hr'),
	castAs('Lenz', 'admin')
];

type CastMember = (typeof cast)[number];

const sessionAs = (member: CastMember, locale: Locale, expiresAt: string): Session => ({
	user: {
		id: member.userId,
		email: `${member.displayName.replace(' ', '.').replace('ö', 'oe').toLowerCase()}@example.com`,
		displayName: member.displayName,
		role: member.role,
		locale,
		status: 'demo',
		employeeId: member.employee.id,
		lastLoginAt: null
	},
	tenant: { ...mockSession.tenant, kind: 'sandbox', expiresAt },
	mode: 'demo',
	leadsTeams: member.role === 'team_lead' ? [{ id: teamIds.tax, name: 'Steuerberatung' }] : [],
	security: { enrollmentPending: false, reauthUntil: null },
	csrfToken: `mock-csrf-demo-${member.userId.slice(0, 8)}`
});

const seedOutbox = (): OutboxMail[] => [
	{
		id: '4b1e7c90-2d5f-4a38-9e61-8c0f3a7d2b54',
		to: 'jonas.brandt@example.com',
		subject: 'Hinweis zum Urlaubsverfall: Resturlaub 2026',
		text: [
			'Hallo Jonas Brandt,',
			'',
			'aus dem Urlaubsjahr 2026 stehen Ihnen noch 6,5 Urlaubstage zu. Bitte beantragen und nehmen Sie diesen Urlaub bis zum 31.03.2027.',
			'',
			'Urlaub, der bis dahin nicht genommen ist, verfällt nach § 7 Abs. 3 BUrlG ersatzlos. Den Antrag stellen Sie in DMN Zeit unter „Urlaub“.'
		].join('\n'),
		createdAt: '2026-09-24T09:12:05+02:00'
	},
	{
		id: 'e20a6f3d-91c4-47b8-a5d2-3f7e0b9c6a18',
		to: 'lea.schwerdtfeger@example.com',
		subject: 'Urlaub nach Attest zurückgebucht',
		text: [
			'Hallo Lea Schwerdtfeger,',
			'',
			'die Personalverwaltung hat Ihr Attest für die Zeit vom 08.09.2026 bis 10.09.2026 bestätigt. Nach § 9 BUrlG wurden 3 Urlaubstage Ihrem Urlaubskonto wieder gutgeschrieben: 08.09.2026, 09.09.2026, 10.09.2026.'
		].join('\n'),
		createdAt: '2026-09-23T16:40:12+02:00'
	},
	{
		id: '7c3d9a15-6e2b-4f07-b8c4-1a5e9d3f7b20',
		to: 'jonas.brandt@example.com',
		subject: 'Neuer Passkey für DMN Zeit',
		text: [
			'Hallo Jonas Brandt,',
			'',
			'Ihrem Zugang zu DMN Zeit wurde der Passkey „iPhone“ hinzugefügt.',
			'',
			'Waren Sie das nicht, wenden Sie sich bitte umgehend an Ihre Administration.'
		].join('\n'),
		createdAt: '2026-09-24T10:03:47+02:00'
	}
];

let mode: PublicConfig['mode'] = 'live';
let refusal: 'throttled' | 'full' | null = null;
let session: Session | null = null;
let outbox = seedOutbox();

export const resetMockDemo = (next: PublicConfig['mode'] = 'live') => {
	mode = next;
	refusal = null;
	session = null;
	outbox = seedOutbox();
};

// the api refuses by ip and at 300 active sandboxes, tests pick the answer directly
export const refuseMockSandbox = (why: 'throttled' | 'full') => {
	refusal = why;
};

export const demoHandlers = [
	http.get('/api/config', () => HttpResponse.json({ mode } satisfies PublicConfig)),

	http.post('/api/demo/sandboxes', async ({ request }) => {
		if (mode !== 'demo') return fail(404, 'NOT_FOUND', 'Not available outside the demo');
		if (refusal === 'throttled') {
			return refuse(429, 'RATE_LIMITED', 'Too many sandboxes from this address', 600);
		}
		if (refusal === 'full') return refuse(503, 'SANDBOX_LIMIT', 'Too many demo sandboxes', 900);
		const { locale } = (await request.json()) as CreateSandboxInput;
		const expiresAt = new Date(Date.now() + 24 * 3_600_000).toISOString();
		session = sessionAs(cast[0]!, locale, expiresAt);
		return HttpResponse.json(session, { status: 201 });
	}),

	http.get('/api/demo/personas', () => {
		const current = session;
		if (!current) return fail(401, 'UNAUTHENTICATED', 'No session');
		return HttpResponse.json(
			cast.map((member): Persona => ({ ...member, current: member.userId === current.user.id }))
		);
	}),

	http.post('/api/demo/switch', async ({ request }) => {
		const current = session;
		if (!current) return fail(401, 'UNAUTHENTICATED', 'No session');
		if (request.headers.get('X-CSRF-Token') !== current.csrfToken) {
			return fail(403, 'CSRF', 'Missing or wrong csrf token');
		}
		const { userId } = (await request.json()) as SwitchPersonaInput;
		const member = cast.find((person) => person.userId === userId);
		if (!member) return fail(404, 'NOT_FOUND', 'No persona with this id in the sandbox');
		session = sessionAs(member, current.user.locale, current.tenant.expiresAt!);
		return HttpResponse.json(session);
	}),

	http.get('/api/demo/outbox', () =>
		session ? HttpResponse.json(outbox) : fail(401, 'UNAUTHENTICATED', 'No session')
	),

	// while a sandbox runs these answer instead of handlers.ts, which only knows mara's login
	http.get('/api/auth/session', () => (session ? HttpResponse.json(session) : undefined)),

	http.post('/api/auth/logout', () => {
		if (!session) return;
		session = null;
		return done();
	}),

	http.patch('/api/me', async ({ request }) => {
		const current = session;
		if (!current) return;
		const { locale } = (await request.json()) as { locale: Locale };
		session = { ...current, user: { ...current.user, locale } };
		return HttpResponse.json(session.user);
	})
];
