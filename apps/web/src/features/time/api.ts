import type { AckFindingInput } from '@zeit/shared';
import { request } from '../../lib/api/client';

export const ackFinding = (input: AckFindingInput) =>
	request('/compliance/findings/ack', { method: 'POST', body: input });
