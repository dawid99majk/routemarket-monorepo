import { Badge } from '@routemarket/frontend';

export const Warianty = () => (
  <div className="flex flex-wrap gap-2">
    <Badge>koniecznie</Badge>
    <Badge variant="secondary">jeśli wyjdzie</Badge>
    <Badge variant="outline">propozycja agenta</Badge>
    <Badge variant="destructive">odrzucone</Badge>
  </div>
);

export const ZnacznikiNastroju = () => (
  <div className="flex flex-wrap gap-2">
    <Badge variant="secondary">historyczne</Badge>
    <Badge variant="secondary">widokowe</Badge>
    <Badge variant="secondary">zielone</Badge>
    <Badge variant="secondary">dla-dzieci</Badge>
    <Badge variant="secondary">kulinarne</Badge>
  </div>
);
