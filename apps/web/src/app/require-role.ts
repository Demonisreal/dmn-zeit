import { redirect } from '@tanstack/react-router';
import { hasRole, type Role, type Session } from '@zeit/shared';

// the api checks again, this only keeps people off pages whose calls would all end in 403
export function requireRole(session: Session, role: Role) {
	if (!hasRole(session.user.role, role)) throw redirect({ to: '/' });
}
