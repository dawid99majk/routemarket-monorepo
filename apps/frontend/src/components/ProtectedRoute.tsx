import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { hasRole } from '@/lib/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-muted border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!hasRole(user, allowedRoles)) {
    // If it was a creator-only route, send them to become-creator instead of home
    if (allowedRoles.includes('creator')) {
      return <Navigate to="/become-creator" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
