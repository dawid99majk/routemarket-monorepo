import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Map as MapIcon, Bike, Mountain, Footprints } from 'lucide-react';

type RouteMode = 'fastbike' | 'trekking' | 'hiking-mountain' | null;

export default function CreateRoute() {
  const navigate = useNavigate();
  const { user, isCreator } = useAuth();
  const [selectedMode, setSelectedMode] = useState<RouteMode>(null);

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

  if (selectedMode) {
    return (
      <div className="flex flex-col h-screen w-full bg-background">
        <div className="flex items-center p-4 border-b">
          <Button variant="ghost" onClick={() => setSelectedMode(null)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Powrót do wyboru trybu
          </Button>
          <div className="ml-auto font-semibold">
            {selectedMode === 'fastbike' && 'Rower Szosowy'}
            {selectedMode === 'trekking' && 'Gravel / MTB'}
            {selectedMode === 'hiking-mountain' && 'Hiking'}
          </div>
        </div>
        <div className="flex-1 w-full h-full">
          <iframe 
            src={`/atlas/?embed=true&profile=${selectedMode}`} 
            className="w-full h-full border-0"
            title="AI Route Planner"
            allow="geolocation"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-4">Wybierz tryb pracy</h1>
          <p className="text-xl text-muted-foreground">
            Z jakim sprzętem Twój klient wyruszy na tę trasę?
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card 
            className="flex flex-col items-center justify-center p-10 cursor-pointer hover:border-primary hover:shadow-lg transition-all"
            onClick={() => setSelectedMode('fastbike')}
          >
            <Bike className="w-20 h-20 text-blue-500 mb-6" />
            <h2 className="text-2xl font-bold mb-2 text-center">Rower Szosowy</h2>
            <p className="text-muted-foreground text-center">
              Asfalt, prędkość i optymalizacja profilu wysokościowego.
            </p>
          </Card>

          <Card 
            className="flex flex-col items-center justify-center p-10 cursor-pointer hover:border-primary hover:shadow-lg transition-all"
            onClick={() => setSelectedMode('trekking')}
          >
            <Mountain className="w-20 h-20 text-orange-500 mb-6" />
            <h2 className="text-2xl font-bold mb-2 text-center">Gravel / MTB</h2>
            <p className="text-muted-foreground text-center">
              Szutry, ścieżki leśne i eksploracja bezdroży.
            </p>
          </Card>

          <Card 
            className="flex flex-col items-center justify-center p-10 cursor-pointer hover:border-primary hover:shadow-lg transition-all"
            onClick={() => setSelectedMode('hiking-mountain')}
          >
            <Footprints className="w-20 h-20 text-green-500 mb-6" />
            <h2 className="text-2xl font-bold mb-2 text-center">Hiking</h2>
            <p className="text-muted-foreground text-center">
              Piesze wędrówki górskie i szlaki turystyczne.
            </p>
          </Card>
        </div>

        <div className="mt-12 flex justify-center">
          <Button variant="outline" onClick={() => navigate('/creator-dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Powrót do panelu
          </Button>
        </div>
      </div>
    </div>
  );
}
