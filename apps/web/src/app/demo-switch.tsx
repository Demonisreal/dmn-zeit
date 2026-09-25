import { useQuery } from '@tanstack/react-query';
import { PersonaMenu } from '../features/demo/persona-menu';
import { sessionQuery } from '../lib/api/auth';

export function DemoSwitch() {
	const { data: session } = useQuery(sessionQuery);
	return session?.mode === 'demo' ? <PersonaMenu /> : null;
}
