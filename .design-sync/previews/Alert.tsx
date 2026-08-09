import { Alert, AlertTitle, AlertDescription } from '@routemarket/frontend';
import { AlertTriangle, Info } from 'lucide-react';

export const Informacja = () => (
  <Alert className="max-w-lg">
    <Info className="h-4 w-4" />
    <AlertTitle>Trasa wyszła krótsza, niż zakładaliśmy</AlertTitle>
    <AlertDescription>
      W tej okolicy nie ma więcej sensownych punktów w zasięgu spaceru. Napisz, czy dorzucić
      coś dalej od centrum, czy zostawiamy krócej i spokojniej.
    </AlertDescription>
  </Alert>
);

export const Ostrzezenie = () => (
  <Alert variant="destructive" className="max-w-lg">
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle>Dwa miejsca daleko od reszty</AlertTitle>
    <AlertDescription>
      Muzeum Etnograficzne i ZOO leżą 8 km od pozostałych punktów. Dojazd zje czas
      przeznaczony na zwiedzanie — rozważ osobny dzień.
    </AlertDescription>
  </Alert>
);
