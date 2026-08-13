import { useEffect, useState } from 'react';
import { Loader2, Save, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';

export interface RoutePreferenceValues {
  pace: number;
  popularity: number;
  wandering: number;
  dining: number;
  effort: number;
  crowds: number;
}

export const DEFAULT_PREFERENCES: RoutePreferenceValues = {
  pace: 50,
  popularity: 50,
  wandering: 50,
  dining: 50,
  effort: 50,
  crowds: 50
};

/** Każda oś to jedna decyzja, którą silnik potrafi przełożyć na dobór punktów. */
export const AXES: {
  key: keyof RoutePreferenceValues;
  title: string;
  left: string;
  right: string;
  hint: string;
}[] = [
  {
    key: 'pace',
    title: 'Tempo zwiedzania',
    left: 'Zobaczyć więcej, szybciej',
    right: 'Więcej czasu na każde miejsce',
    hint: 'Decyduje, ile przystanków zmieści się w tym samym czasie.'
  },
  {
    key: 'popularity',
    title: 'Popularność miejsc',
    left: 'Klasyki i must-see',
    right: 'Niszowe i nieoczywiste',
    hint: 'Ikony regionu czy miejsca, o których wiedzą głównie mieszkańcy.'
  },
  {
    key: 'wandering',
    title: 'Charakter trasy',
    left: 'Udeptane trasy',
    right: 'Szwendanie się bocznymi uliczkami',
    hint: 'Jak prowadzimy między punktami — najkrócej czy przez podwórka i zaułki.'
  },
  {
    key: 'dining',
    title: 'Jedzenie i kawa',
    left: 'Eleganckie restauracje',
    right: 'Street food i przydrożna kawa',
    hint: 'Wpływa na przystanki gastronomiczne i rekomendacje w przewodniku.'
  },
  {
    key: 'effort',
    title: 'Wysiłek',
    left: 'Spokojnie i płasko',
    right: 'Podejścia mile widziane',
    hint: 'W mieście wzgórza i tarasy, w górach przewyższenia.'
  },
  {
    key: 'crowds',
    title: 'Tłumy',
    left: 'Nie przeszkadzają mi',
    right: 'Unikaj tłumów',
    hint: 'Przy wysokim ustawieniu dobieramy też mniej oblegane pory dnia.'
  }
];

export default function RoutePreferences() {
  const [values, setValues] = useState<RoutePreferenceValues>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setLoading(false);
        return;
      }
      const { data } = await (supabase as any)
        .from('route_preferences')
        .select('pace, popularity, wandering, dining, effort, crowds')
        .eq('user_id', userData.user.id)
        .maybeSingle();
      if (data) setValues({ ...DEFAULT_PREFERENCES, ...data });
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Brak zalogowanego użytkownika');
      const { error } = await (supabase as any)
        .from('route_preferences')
        .upsert({ user_id: userData.user.id, ...values, updated_at: new Date().toISOString() });
      if (error) throw error;
      toast.success('Preferencje zapisane — agent będzie je uwzględniał przy kolejnych trasach.');
    } catch (err: any) {
      toast.error(`Nie udało się zapisać: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Wczytuję preferencje…
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="w-5 h-5 text-primary" />
          Preferencje tras
        </CardTitle>
        <CardDescription>
          Ustaw raz, a agent będzie planował pod Ciebie. Przy konkretnej trasie zawsze możesz powiedzieć inaczej.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {AXES.map((axis) => (
          <div key={axis.key} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-sm">{axis.title}</span>
              <span className="text-xs text-muted-foreground">{axis.hint}</span>
            </div>
            <Slider
              value={[values[axis.key]]}
              onValueChange={([v]) => setValues((prev) => ({ ...prev, [axis.key]: v }))}
              min={0}
              max={100}
              step={10}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className={values[axis.key] < 40 ? 'text-primary font-medium' : ''}>{axis.left}</span>
              <span className={values[axis.key] > 60 ? 'text-primary font-medium' : ''}>{axis.right}</span>
            </div>
          </div>
        ))}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="ghost" onClick={() => setValues(DEFAULT_PREFERENCES)} disabled={saving}>
            Wyzeruj
          </Button>
          <Button onClick={save} disabled={saving} className="bg-primary hover:bg-primary/90">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Zapisz preferencje
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
