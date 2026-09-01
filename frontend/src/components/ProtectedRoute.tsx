import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';

export function ProtectedRoute({
  children,
  levels,
}: {
  children: JSX.Element;
  levels?: Array<'ADMIN' | 'OPERATOR' | 'PARTICIPANT'>;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="p-8 text-center text-gray-500">Validando acesso…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (levels && !levels.includes(user.accessLevel)) return <Navigate to="/" replace />;
  return children;
}
