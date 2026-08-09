import { Switch, Label } from '@routemarket/frontend';

export const Przelaczniki = () => (
  <div className="space-y-3 max-w-xs">
    <div className="flex items-center justify-between">
      <Label htmlFor="s1">Tablica publiczna</Label>
      <Switch id="s1" defaultChecked />
    </div>
    <div className="flex items-center justify-between">
      <Label htmlFor="s2">Pokaż propozycje agenta</Label>
      <Switch id="s2" />
    </div>
    <div className="flex items-center justify-between opacity-60">
      <Label htmlFor="s3">Niedostępne</Label>
      <Switch id="s3" disabled />
    </div>
  </div>
);
