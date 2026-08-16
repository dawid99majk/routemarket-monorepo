import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { hasRole } from '@/lib/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Pominięte = wystarczy zalogowanie. Po usunięciu podziału na typy kont
   *  większość stron nie potrzebuje już żadnej roli. */
  allowedRoles?: string[];
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
  if (allowedRoles && allowedRoles.length > 0 && !hasRole(user, allowedRoles)) {
    // Trasy dla twórców zniknęły razem z modułem sprzedaży, a /become-creator
    // nie istnieje w routingu — odsyłanie tam kończyło się pustą stroną.
    if (allowedRoles.includes('creator')) {
      return <Navigate to="/start" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
