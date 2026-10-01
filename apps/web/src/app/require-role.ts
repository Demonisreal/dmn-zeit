import { redirect } from '@tanstack/react-router';
import { hasRole, type Role, type Session, type WorkspaceKind } from '@zeit/shared';

export function requireRole(session: Session, role: Role) {
	if (!hasRole(session.user.role, role)) throw redirect({ to: '/' });
}

export function requireWorkspace(session: Session, workspace: WorkspaceKind) {
	if (session.tenant.workspace !== workspace) throw redirect({ to: '/' });
}
