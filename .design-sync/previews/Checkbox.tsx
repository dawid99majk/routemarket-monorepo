import { Checkbox, Label } from '@routemarket/frontend';

export const Filtry = () => (
  <div className="space-y-2.5 max-w-xs">
    <div className="flex items-center gap-2"><Checkbox id="c1" defaultChecked /><Label htmlFor="c1">Otwarte teraz</Label></div>
    <div className="flex items-center gap-2"><Checkbox id="c2" defaultChecked /><Label htmlFor="c2">Bezpłatne wejście</Label></div>
    <div className="flex items-center gap-2"><Checkbox id="c3" /><Label htmlFor="c3">Dobre dla dzieci</Label></div>
    <div className="flex items-center gap-2 opacity-60"><Checkbox id="c4" disabled /><Label htmlFor="c4">Niedostępne</Label></div>
  </div>
);
