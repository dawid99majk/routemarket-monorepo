import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRouteById } from '@/hooks/use-routes';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Map as MapIcon, Loader2, Cloud } from 'lucide-react';

export default function EditRoute() {
  const { id } = useParams<{ id: string }>();
  const routeId = id ? parseInt(id) : undefined;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: existingRoute, isLoading } = useRouteById(routeId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!existingRoute || existingRoute.user_id !== user?.id) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4">
        <MapIcon className="w-16 h-16 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold text-muted-foreground">Nie masz dostępu do edycji tej trasy</h2>
        <Button variant="outline" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Strona główna
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4">
      <Cloud className="w-16 h-16 text-primary mb-4" />
      <h1 className="text-3xl font-bold">Cloud Run Integration</h1>
      <p className="text-muted-foreground text-center max-w-md">
        Edycja tras jest teraz obsługiwana przez nową infrastrukturę opartą o Google Cloud Run.
        (Work in progress)
      </p>
      <div className="flex gap-4 mt-8">
        <Button variant="outline" onClick={() => navigate(`/route/${routeId}`)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Powrót do trasy
        </Button>
        <Button variant="outline" onClick={() => navigate('/creator-dashboard')}>
          Powrót do panelu
        </Button>
      </div>
    </div>
  );
}

