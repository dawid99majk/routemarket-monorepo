import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button, Badge } from '@routemarket/frontend';

export const MiejsceNaTablicy = () => (
  <Card className="max-w-sm">
    <CardHeader>
      <CardTitle>Hala Targowa</CardTitle>
      <CardDescription>Wrocław · ok. 45 min</CardDescription>
    </CardHeader>
    <CardContent className="text-sm text-muted-foreground">
      Modernistyczna hala z 1908 roku o żelbetowej konstrukcji łukowej. Na parterze stragany
      z warzywami i kwiatami, na antresoli kawiarnie.
    </CardContent>
    <CardFooter className="gap-2">
      <Button size="sm">Dodaj do tablicy</Button>
      <Button size="sm" variant="ghost">Szczegóły</Button>
    </CardFooter>
  </Card>
);

export const ZEtykietami = () => (
  <Card className="max-w-sm">
    <CardHeader className="gap-2">
      <div className="flex gap-1.5">
        <Badge>historyczne</Badge>
        <Badge variant="secondary">targowe</Badge>
      </div>
      <CardTitle>Ostrów Tumski</CardTitle>
      <CardDescription>Najstarsza część miasta</CardDescription>
    </CardHeader>
    <CardContent className="text-sm text-muted-foreground">
      Wyspa katedralna z brukowanymi uliczkami i latarniami gazowymi zapalanymi ręcznie o zmierzchu.
    </CardContent>
  </Card>
);

export const Pusta = () => (
  <Card className="max-w-sm">
    <CardHeader>
      <CardTitle>Brak miejsc</CardTitle>
      <CardDescription>Ta tablica jest jeszcze pusta</CardDescription>
    </CardHeader>
    <CardFooter>
      <Button size="sm" variant="outline">Znajdź miejsca</Button>
    </CardFooter>
  </Card>
);
