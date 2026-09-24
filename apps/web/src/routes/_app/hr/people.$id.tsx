import { createFileRoute } from '@tanstack/react-router';
import { requireRole } from '../../../app/require-role';
import { EmployeePage } from '../../../features/hr/people/employee-page';

export const Route = createFileRoute('/_app/hr/people/$id')({
	beforeLoad: ({ context }) => requireRole(context.session, 'hr'),
	component: EmployeeRoute
});

function EmployeeRoute() {
	const { id } = Route.useParams();
	return <EmployeePage key={id} id={id} />;
}
