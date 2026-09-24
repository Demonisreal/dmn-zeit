import { queryOptions, skipToken } from '@tanstack/react-query';
import { vacationAccountSchema } from '@zeit/shared';
import { request } from '../../lib/api/client';

export const vacationQuery = (employeeId: string | null, year: number) =>
	queryOptions({
		queryKey: ['vacation', employeeId, year],
		queryFn: employeeId
			? () =>
					request(`/employees/${employeeId}/vacation?year=${year}`, {
						schema: vacationAccountSchema
					})
			: skipToken
	});

export const acknowledgeNotice = (id: string) =>
	request(`/me/vacation/notices/${id}/acknowledge`, { method: 'POST' });
