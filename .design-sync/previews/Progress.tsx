import { Progress } from '@routemarket/frontend';

export const ZajetoscDnia = () => (
  <div className="space-y-4 max-w-sm">
    <div className="space-y-1.5">
      <Progress value={38} />
      <p className="text-[11px] text-muted-foreground tabular-nums">Zebrane: 3,0 h z 7,7 h</p>
    </div>
    <div className="space-y-1.5">
      <Progress value={82} />
      <p className="text-[11px] text-muted-foreground tabular-nums">Zebrane: 6,4 h z 7,7 h</p>
    </div>
    <div className="space-y-1.5">
      <Progress value={100} />
      <p className="text-[11px] text-muted-foreground tabular-nums">Dzień wypełniony</p>
    </div>
  </div>
);
