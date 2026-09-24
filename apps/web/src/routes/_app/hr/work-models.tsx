import { createFileRoute } from '@tanstack/react-router';
import { requireRole } from '../../../app/require-role';
import { WorkModelsPage } from '../../../features/hr/work-models/work-models-page';

export const Route = createFileRoute('/_app/hr/work-models')({
	beforeLoad: ({ context }) => requireRole(context.session, 'hr'),
	component: WorkModelsPage
});
