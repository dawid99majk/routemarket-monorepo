import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles, 
  Bike, 
  Compass, 
  Mountain, 
  Loader2, 
  AlertTriangle 
} from 'lucide-react';
import { toast } from 'sonner';

interface CreatorNewProjectFormProps {
  balance: number;
  unlimitedCredits?: boolean;
  onTopUp: () => void;
  onCreate: (params: any) => Promise<void>;
  isCreating: boolean;
}

export type MVPCategory = 
  | 'motorcycle_road' 
  | 'cycling_road' 
  | 'cycling_gravel_mtb' 
  | 'trekking_day' 
  | 'trekking_multi_day';

export function CreatorNewProjectForm({
  balance,
  unlimitedCredits = false,
  onTopUp,
  onCreate,
  isCreating
}: CreatorNewProjectFormProps) {
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState<MVPCategory>('motorcycle_road');
  const [region, setRegion] = useState('Polska');
  const [deepResearch, setDeepResearch] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    const cost = deepResearch ? 50 : 25;
    if (!unlimitedCredits && balance < cost) {
      toast.error(`Niewystarczająca ilość kredytów! Wymagane: ${cost}, posiadasz: ${balance}.`);
      onTopUp();
      return;
    }

    // Map MVP categories to legacy ones for backend compatibility if needed
    let legacyCategory = 'hiking';
    if (category.startsWith('motorcycle')) legacyCategory = 'motorcycle';
    if (category.startsWith('cycling')) legacyCategory = 'cycling';
    if (category.startsWith('trekking')) legacyCategory = 'hiking';

    await onCreate({
      topic,
      category: legacyCategory,
      mvp_category: category, // Pass the new precise category
      region,
      deepResearch,
      language: 'pl'
    });
    
    setTopic('');
  };

  const categories: Array<{ id: MVPCategory, label: string, icon: any }> = [
    { id: 'motorcycle_road', label: 'Motocykl Szosowy', icon: Compass },
    { id: 'cycling_road', label: 'Rower Szosowy', icon: Bike },
    { id: 'cycling_gravel_mtb', label: 'Rower Gravel/MTB', icon: Bike },
    { id: 'trekking_day', label: 'Trekking Jednodniowy', icon: Mountain },
    { id: 'trekking_multi_day', label: 'Trekking Wieloetapowy', icon: Mountain },
  ];

  return (
    <Card className="border-primary/20 shadow-md bg-gradient-premium relative overflow-hidden">
      <CardContent className="p-6 space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            Kreator Magic AI Studio
          </h2>
          <p className="text-xs text-muted-foreground">Podaj szczegóły trasy, aby stworzyć przestrzeń roboczą AI.</p>
        </div>

        <div className="p-3 rounded-xl border border-border/80 bg-card/60 backdrop-blur-sm flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">Twój portfel</span>
            <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-primary badge-glow-primary" />
              {unlimitedCredits ? 'Bez limitu' : `${balance} Kredytów`}
            </p>
          </div>
          {!unlimitedCredits && (
            <Button variant="outline" size="sm" onClick={onTopUp} className="h-8 text-xs font-semibold">
              Doładuj
            </Button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium">Temat trasy / Idea przewodnia</label>
            <Input 
              value={topic} 
              onChange={(e) => setTopic(e.target.value)} 
              placeholder="np. Pętla po Gorcach i Pieninach" 
              required 
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Kategoria trasy (MVP)</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {categories.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all duration-200 ${
                      category === cat.id 
                        ? 'bg-primary/10 border-primary text-primary shadow-sm' 
                        : 'bg-background hover:bg-muted border-border text-muted-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-semibold">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Region</label>
            <Input 
              value={region} 
              onChange={(e) => setRegion(e.target.value)} 
              placeholder="np. Podhale, Polska" 
            />
          </div>

          <div 
            onClick={() => setDeepResearch(!deepResearch)}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 ${
              deepResearch 
                ? 'bg-primary/5 border-primary shadow-inner' 
                : 'bg-background border-dashed border-border hover:border-primary/30'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className={`w-5 h-5 ${deepResearch ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
                <span className={`text-sm font-bold ${deepResearch ? 'text-primary' : 'text-foreground'}`}>Gemini Deep Research</span>
              </div>
              <Badge variant={deepResearch ? 'default' : 'outline'}>
                {unlimitedCredits ? 'admin' : deepResearch ? '50 cr' : '25 cr'}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Tryb zaawansowany: AI przeszuka internet, blogi i filmy, aby znaleźć ukryte perełki, parkingi i schroniska.
            </p>
          </div>

          <Button type="submit" disabled={isCreating || !topic} className="w-full h-12 gap-2 text-base font-bold shadow-token-lg">
            {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            {isCreating ? 'Tworzenie przestrzeni...' : 'Uruchom Magię AI'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
