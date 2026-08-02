import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Route as RouteIcon, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';
import TripProjects from '@/components/TripProjects';

/**
 * Plany wyjazdów jako osobna strona. Wcześniej mieszkały pod ustawieniami konta,
 * gdzie nikt ich nie szukał — a to jest miejsce, w którym spędza się czas
 * tygodniami przed wyjazdem, nie ekran konfiguracji.
 */
export default function TripPlans() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Logo />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/my-routes')}>
              <RouteIcon className="w-4 h-4 mr-1.5" /> Moje trasy
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/profile')}>
              <User className="w-4 h-4 mr-1.5" /> Profil
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <TripProjects />
      </main>
    </div>
  );
}
