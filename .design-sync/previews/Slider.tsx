import { Slider, Label } from '@routemarket/frontend';

export const WypelnienieCzasu = () => (
  <div className="space-y-2 max-w-sm">
    <div className="flex justify-between items-baseline">
      <Label>Ile czasu zaplanować</Label>
      <span className="text-sm font-semibold text-primary tabular-nums">70%</span>
    </div>
    <Slider defaultValue={[70]} max={100} step={5} />
    <p className="text-[11px] text-muted-foreground">
      Zaplanowane atrakcje wypełnią tyle procent Twojego czasu, resztę zostawiamy na przerwy
      i włóczenie się po okolicy.
    </p>
  </div>
);
