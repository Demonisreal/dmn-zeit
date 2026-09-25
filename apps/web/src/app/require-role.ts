import { redirect } from '@tanstack/react-router';
import { hasRole, type Role, type Session, type WorkspaceKind } from '@zeit/shared';

// the api checks again, this only keeps people off pages whose calls would all end in 403
export function requireRole(session: Session, role: Role) {
	if (!hasRole(session.user.role, role)) throw redirect({ to: '/' });
}

// the api answers 404 outside its workspace, the start page exists in both
export function requireWorkspace(session: Session, workspace: WorkspaceKind) {
	if (session.tenant.workspace !== workspace) throw redirect({ to: '/' });
}
