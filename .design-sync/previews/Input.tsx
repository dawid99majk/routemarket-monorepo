import { Input, Label } from '@routemarket/frontend';

export const Pola = () => (
  <div className="space-y-3 max-w-sm">
    <div className="space-y-1.5">
      <Label htmlFor="a">Miasto</Label>
      <Input id="a" defaultValue="Wrocław" />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="b">Czego szukasz</Label>
      <Input id="b" placeholder="np. klimatyczne kawiarnie" />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="c">Niedostępne</Label>
      <Input id="c" defaultValue="Zablokowane" disabled />
    </div>
  </div>
);

export const Typy = () => (
  <div className="grid grid-cols-2 gap-3 max-w-md">
    <Input type="date" defaultValue="2026-08-12" />
    <Input type="time" defaultValue="17:00" />
    <Input type="number" defaultValue={3} />
    <Input type="search" placeholder="Szukaj miejsca" />
  </div>
);
