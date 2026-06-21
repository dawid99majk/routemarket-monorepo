import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Map as MapIcon, Bike, Mountain, Footprints } from 'lucide-react';
import RouteBuilderV2 from './v2/RouteBuilderV2';

type RouteMode = 'fastbike' | 'trekking' | 'hiking-mountain' | null;

export interface WizardData {
  mode: string;
  startLocation: string;
  routeType: string;
  destination: string;
  distance: string;
  difficulty: string;
}

export default function CreateRoute() {
  const navigate = useNavigate();
  const { user, isCreator } = useAuth();
  
  // Wizard state
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedMode, setSelectedMode] = useState<RouteMode>(null);
  
  // Step 2 Form State
  const [startLocation, setStartLocation] = useState('');
  const [routeType, setRouteType] = useState('pętla');
  const [destination, setDestination] = useState('');
  const [distance, setDistance] = useState('');
  const [difficulty, setDifficulty] = useState('Umiarkowany');

  // Final Data
  const [wizardData, setWizardData] = useState<WizardData | null>(null);

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

  // If wizard is completed, show the map builder
  if (wizardData) {
    return (
      <RouteBuilderV2 
        initialData={wizardData} 
        onBack={() => setWizardData(null)} 
      />
    );
  }

  const handleModeSelect = (mode: RouteMode) => {
    setSelectedMode(mode);
    setStep(2);
  };

  const handleWizardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMode || !startLocation || !distance) return;
    
    setWizardData({
      mode: selectedMode,
      startLocation,
      routeType,
      destination: routeType === 'w jedną stronę' ? destination : '',
      distance,
      difficulty
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        {step === 1 && (
          <>
            <div className="mb-8 text-center">
              <h1 className="text-4xl font-bold mb-4">Kreator Trasy - Krok 1</h1>
              <p className="text-xl text-muted-foreground">
                Z jakim sprzętem Twój klient wyruszy na tę trasę?
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card 
                className="flex flex-col items-center justify-center p-10 cursor-pointer hover:border-primary hover:shadow-lg transition-all"
                onClick={() => handleModeSelect('fastbike')}
              >
                <Bike className="w-20 h-20 text-blue-500 mb-6" />
                <h2 className="text-2xl font-bold mb-2 text-center">Rower Szosowy</h2>
                <p className="text-muted-foreground text-center">
                  Asfalt, prędkość i optymalizacja profilu wysokościowego.
                </p>
              </Card>

              <Card 
                className="flex flex-col items-center justify-center p-10 cursor-pointer hover:border-primary hover:shadow-lg transition-all"
                onClick={() => handleModeSelect('trekking')}
              >
                <Mountain className="w-20 h-20 text-orange-500 mb-6" />
                <h2 className="text-2xl font-bold mb-2 text-center">Gravel / MTB</h2>
                <p className="text-muted-foreground text-center">
                  Szutry, ścieżki leśne i eksploracja bezdroży.
                </p>
              </Card>

              <Card 
                className="flex flex-col items-center justify-center p-10 cursor-pointer hover:border-primary hover:shadow-lg transition-all"
                onClick={() => handleModeSelect('hiking-mountain')}
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
          </>
        )}

        {step === 2 && (
          <div className="max-w-xl mx-auto">
            <div className="mb-8 text-center">
              <h1 className="text-4xl font-bold mb-4">Kreator Trasy - Krok 2</h1>
              <p className="text-xl text-muted-foreground">
                Podaj podstawowe założenia trasy
              </p>
            </div>

            <Card className="p-8">
              <form onSubmit={handleWizardSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="startLocation">Miejsce startu</Label>
                  <Input 
                    id="startLocation" 
                    placeholder="np. Kłodzko, Rynek" 
                    value={startLocation}
                    onChange={(e) => setStartLocation(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Typ trasy</Label>
                  <Select value={routeType} onValueChange={setRouteType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz typ trasy" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pętla">Pętla (Start i Meta w tym samym miejscu)</SelectItem>
                      <SelectItem value="tam i z powrotem">Tam i z powrotem</SelectItem>
                      <SelectItem value="w jedną stronę">W jedną stronę</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {routeType === 'w jedną stronę' && (
                  <div className="space-y-2">
                    <Label htmlFor="destination">Meta</Label>
                    <Input 
                      id="destination" 
                      placeholder="np. Srebrna Góra, Twierdza" 
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      required={routeType === 'w jedną stronę'}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="distance">Przybliżony dystans (km)</Label>
                  <Input 
                    id="distance" 
                    type="number"
                    min="1"
                    placeholder="np. 50" 
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Poziom trudności</Label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz poziom trudności" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Łatwy">Łatwy (rekreacyjny)</SelectItem>
                      <SelectItem value="Umiarkowany">Umiarkowany (dla aktywnych)</SelectItem>
                      <SelectItem value="Trudny">Trudny (wymagający)</SelectItem>
                      <SelectItem value="Ekstremalny">Ekstremalny (dla ekspertów)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-4 pt-4">
                  <Button type="button" variant="outline" className="w-full" onClick={() => setStep(1)}>
                    Wstecz
                  </Button>
                  <Button type="submit" className="w-full">
                    Rozpocznij z AI
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
