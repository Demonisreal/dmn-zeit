import { workModelSchema } from '@zeit/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi, type Api } from '../auth/api';
import { signedIn, type Desk } from '../helpers/desk';
import { createPerson, createTenant, createUser } from '../helpers/pg';

let api: Api;
let tenant: string;
let hr: Desk;

const fullTime = { mon: 480, tue: 480, wed: 480, thu: 480, fri: 480, sat: 0, sun: 0 };

beforeAll(async () => {
	api = await startApi();
	tenant = await createTenant();
	hr = await signedIn(api, (await createUser(tenant, { role: 'hr' })).userId);
});

afterAll(() => api.app.close());

describe('work models', () => {
	it('creates a model and lists it', async () => {
		const answer = await hr.post('/work-models', { name: 'Vollzeit 40 h', minutes: fullTime });
		expect(answer.status).toBe(201);
		expect(workModelSchema.safeParse(answer.body).success).toBe(true);
		expect(answer.body).toMatchObject({
			name: 'Vollzeit 40 h',
			minutes: fullTime,
			archivedAt: null
		});

		const list = await hr.get('/work-models');
		expect(list.body).toContainEqual(answer.body);
	});

	it('archives a model, keeps the first date and brings it back', async () => {
		const { id } = (await hr.post('/work-models', { name: 'Minijob', minutes: fullTime })).body;

		const archived = await hr.patch(`/work-models/${id}`, { archived: true });
		expect(archived.status).toBe(200);
		expect(archived.body.archivedAt).toEqual(expect.any(String));
		const again = await hr.patch(`/work-models/${id}`, { archived: true, name: 'Minijob alt' });
		expect(again.body).toMatchObject({ archivedAt: archived.body.archivedAt, name: 'Minijob alt' });

		const ids = async (path: string) =>
			(await hr.get(path)).body.map((model: { id: string }) => model.id);
		expect(await ids('/work-models')).not.toContain(id);
		expect(await ids('/work-models?includeArchived=true')).toContain(id);

		const back = await hr.patch(`/work-models/${id}`, { archived: false });
		expect(back.body.archivedAt).toBeNull();
	});

	it('changes the minutes of the model', async () => {
		const { id } = (await hr.post('/work-models', { name: 'Vier Tage', minutes: fullTime })).body;
		const fourDays = { ...fullTime, fri: 0 };
		const answer = await hr.patch(`/work-models/${id}`, { minutes: fourDays });
		expect(answer.body.minutes).toEqual(fourDays);
		expect((await hr.patch(`/work-models/${id}`, {})).body.minutes).toEqual(fourDays);
	});

	it('checks the body', async () => {
		const tooLong = await hr.post('/work-models', {
			name: 'Zu lang',
			minutes: { ...fullTime, mon: 601 }
		});
		expect(tooLong.status).toBe(400);
		expect(tooLong.body.details[0].field).toBe('minutes.mon');
		expect((await hr.post('/work-models', { name: 'Ohne Tage' })).status).toBe(400);
	});

	it('does not find a model of another tenant', async () => {
		const other = await signedIn(
			api,
			(await createUser(await createTenant(), { role: 'hr' })).userId
		);
		const { id } = (await other.post('/work-models', { name: 'Fremd', minutes: fullTime })).body;

		expect((await hr.patch(`/work-models/${id}`, { name: 'Übernommen' })).status).toBe(404);
		expect((await hr.get('/work-models?includeArchived=true')).body).not.toContainEqual(
			expect.objectContaining({ id })
		);
	});

	it('is for hr only', async () => {
		const lead = await createPerson(tenant, { role: 'team_lead' });
		const asLead = await signedIn(api, lead.userId);
		expect((await asLead.get('/work-models')).status).toBe(403);
		expect((await asLead.post('/work-models', { name: 'Eigenes', minutes: fullTime })).status).toBe(
			403
		);
	});
});
