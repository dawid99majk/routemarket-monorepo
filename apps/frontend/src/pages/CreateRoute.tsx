import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Map as MapIcon, Bike, Mountain, Footprints, Building2, Car } from 'lucide-react';
import RouteBuilderV2 from './v2/RouteBuilderV2';

type VehicleType = 'motorcycle' | 'bicycle' | 'hiking' | 'city' | 'car';
type BikeSubtype = 'gravel' | 'road' | 'mtb';

export interface InitialWizardData {
  vehicleType: VehicleType;
  bikeSubtype?: BikeSubtype;
  routingPreference: 'popular' | 'wild';
  inputNotes: string;
}

export default function CreateRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId');
  const { user, isCreator } = useAuth();
  
  // Wizard state
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedMode, setSelectedMode] = useState<VehicleType | null>(null);
  const [bikeSubtype, setBikeSubtype] = useState<BikeSubtype>('gravel');
  
  // Step 2 Form State
  const [startLocation, setStartLocation] = useState('');
  const [routeType, setRouteType] = useState('pętla');
  const [difficulty, setDifficulty] = useState('Umiarkowany');
  const [distance, setDistance] = useState('');
  const [days, setDays] = useState('');
  const [routingPreference, setRoutingPreference] = useState<'popular' | 'wild'>('popular');

  // Final Data
  const [wizardData, setWizardData] = useState<InitialWizardData | null>(null);

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

  // If wizard is completed OR we have a projectId parameter, show the map builder
  if (projectId || wizardData) {
    return (
      <RouteBuilderV2 
        initialData={wizardData || undefined} 
        onBack={() => {
          setWizardData(null);
          setStep(1);
          navigate('/create');
        }} 
      />
    );
  }

  const handleModeSelect = (mode: VehicleType) => {
    setSelectedMode(mode);
    setStep(2);
  };

  const handleWizardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMode || !startLocation) return;
    
    const isDistanceMode = ['car', 'motorcycle', 'bicycle'].includes(selectedMode);
    
    // Zbuduj początkowe instrukcje (inputNotes) dla Agenta AI
    let notes = `Miejsce startu: ${startLocation}\n`;
    notes += `Typ trasy: ${routeType}\n`;
    notes += `Poziom trudności: ${difficulty}\n`;
    
    if (isDistanceMode && distance) {
      notes += `Dystans: ok. ${distance} km\n`;
    } else if (!isDistanceMode && days) {
      notes += `Czas trwania: ${days} dni\n`;
      // Automatyczne dopowiedzenie co to oznacza dla dziennego dystansu
      if (difficulty === 'Lekki') notes += `(Ok. 10-15 km dziennie)\n`;
      if (difficulty === 'Umiarkowany') notes += `(Ok. 13-20 km dziennie)\n`;
      if (difficulty === 'Wymagający') notes += `(Powyżej 16 km dziennie)\n`;
    }

    setWizardData({
      vehicleType: selectedMode,
      ...(selectedMode === 'bicycle' ? { bikeSubtype } : {}),
      routingPreference,
      inputNotes: notes.trim(),
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Button
                variant="outline"
                className="h-32 flex flex-col items-center justify-center gap-4 text-lg hover:border-primary hover:text-primary transition-colors whitespace-normal text-center"
                onClick={() => handleModeSelect('motorcycle')}
              >
                <Bike className="w-8 h-8" />
                Motocykl
              </Button>

              <div className="border rounded-md p-4 flex flex-col gap-4">
                <Button
                  variant="outline"
                  className="h-20 flex flex-col items-center justify-center gap-2 text-lg hover:border-primary hover:text-primary transition-colors whitespace-normal text-center"
                  onClick={() => handleModeSelect('bicycle')}
                >
                  <Bike className="w-6 h-6" />
                  Rower
                </Button>
                {selectedMode === 'bicycle' || true ? (
                  <Select value={bikeSubtype} onValueChange={(v: any) => setBikeSubtype(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz typ roweru" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gravel">Gravel / Cross</SelectItem>
                      <SelectItem value="road">Szosa</SelectItem>
                      <SelectItem value="mtb">MTB</SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}
              </div>

              <Button
                variant="outline"
                className="h-32 flex flex-col items-center justify-center gap-4 text-lg hover:border-primary hover:text-primary transition-colors whitespace-normal text-center"
                onClick={() => handleModeSelect('hiking')}
              >
                <Mountain className="w-8 h-8" />
                Pieszo (Góry/Natura)
              </Button>

              <Button
                variant="outline"
                className="h-32 flex flex-col items-center justify-center gap-4 text-lg hover:border-primary hover:text-primary transition-colors whitespace-normal text-center"
                onClick={() => handleModeSelect('city')}
              >
                <Building2 className="w-8 h-8" />
                City Break (Miasto)
              </Button>
              
              <Button
                variant="outline"
                className="h-32 flex flex-col items-center justify-center gap-4 text-lg hover:border-primary hover:text-primary transition-colors whitespace-normal text-center"
                onClick={() => handleModeSelect('car')}
              >
                <Car className="w-8 h-8" />
                Samochód (Roadtrip)
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="mb-8 text-center relative">
              <Button 
                variant="ghost" 
                className="absolute left-0 top-0"
                onClick={() => setStep(1)}
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Wstecz
              </Button>
              <h1 className="text-4xl font-bold mb-4">Kreator Trasy - Krok 2</h1>
              <p className="text-xl text-muted-foreground">
                Podaj podstawowe założenia trasy
              </p>
            </div>

            <form onSubmit={handleWizardSubmit} className="max-w-2xl mx-auto space-y-6 bg-card p-8 rounded-xl border">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Miejsce startu</Label>
                  <Input 
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
                      <SelectValue placeholder="Wybierz typ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pętla">Pętla (Start i Meta w tym samym miejscu)</SelectItem>
                      <SelectItem value="z A do B">Z punktu A do punktu B</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Charakter trasy (Wybór POI)</Label>
                  <Select value={routingPreference} onValueChange={(v: any) => setRoutingPreference(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz charakter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="popular">Klasyk (Najpopularniejsze miejsca)</SelectItem>
                      <SelectItem value="wild">Niszowa (Poza utartym szlakiem)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {['car', 'motorcycle', 'bicycle'].includes(selectedMode!) ? (
                  <div className="space-y-2">
                    <Label>Przybliżony dystans (km)</Label>
                    <Input 
                      type="number" 
                      placeholder="np. 50"
                      value={distance}
                      onChange={(e) => setDistance(e.target.value)}
                      required
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Ilość dni</Label>
                    <Input 
                      type="number" 
                      placeholder="np. 3"
                      value={days}
                      onChange={(e) => setDays(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Poziom trudności</Label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz poziom" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Lekki">Lekki (dla początkujących)</SelectItem>
                      <SelectItem value="Umiarkowany">Umiarkowany (dla aktywnych)</SelectItem>
                      <SelectItem value="Wymagający">Wymagający (dla doświadczonych)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <Button type="submit" size="lg" className="w-full sm:w-auto">
                  Rozpocznij z AI <MapIcon className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
