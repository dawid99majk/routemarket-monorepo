import { Button } from '@routemarket/frontend';
import { MapPin, Plus } from 'lucide-react';

export const Warianty = () => (
  <div className="flex flex-wrap gap-3 items-center">
    <Button>Zaplanuj wyjazd</Button>
    <Button variant="secondary">Zapisz na później</Button>
    <Button variant="outline">Przeglądaj miejsca</Button>
    <Button variant="ghost">Anuluj</Button>
    <Button variant="link">Zobacz trasę</Button>
  </div>
);

export const Semantyczne = () => (
  <div className="flex flex-wrap gap-3 items-center">
    <Button variant="success">Plan zapisany</Button>
    <Button variant="warning">Sprawdź godziny</Button>
    <Button variant="danger">Usuń z trasy</Button>
    <Button variant="destructive">Usuń tablicę</Button>
  </div>
);

export const Rozmiary = () => (
  <div className="flex flex-wrap gap-3 items-center">
    <Button size="sm">Mały</Button>
    <Button size="default">Domyślny</Button>
    <Button size="lg">Duży</Button>
    <Button size="icon" aria-label="Dodaj miejsce"><Plus className="w-4 h-4" /></Button>
  </div>
);

export const ZIkona = () => (
  <div className="flex flex-wrap gap-3 items-center">
    <Button><MapPin className="w-4 h-4 mr-2" />Dodaj do tablicy</Button>
    <Button variant="outline" disabled>Niedostępne</Button>
  </div>
);
