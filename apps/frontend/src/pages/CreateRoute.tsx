import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Map as MapIcon, Cloud } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function CreateRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isCreator } = useAuth();

  if (!user || !isCreator) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4">
        <MapIcon className="w-16 h-16 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold text-muted-foreground">
          {!user ? 'Zaloguj się, aby tworzyć trasy' : 'Musisz być twórcą, aby dodać trasę'}
        </h2>
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
        Tworzenie tras jest teraz obsługiwane przez nową infrastrukturę opartą o Google Cloud Run.
        (Work in progress)
      </p>
      <div className="flex gap-4 mt-8">
        <Button variant="outline" onClick={() => navigate('/creator-dashboard')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Powrót do panelu
        </Button>
      </div>
    </div>
  );
}

