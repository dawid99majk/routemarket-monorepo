import React from 'react';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, AlertCircle, Star } from 'lucide-react';
import { type RouteQualityResult } from '@/lib/categories';

interface RouteQualityMeterProps {
  quality: RouteQualityResult;
}

export default function RouteQualityMeter({ quality }: RouteQualityMeterProps) {
  const { score, missing, status } = quality;

  const statusConfig = {
    draft: { label: 'Draft', color: 'text-muted-foreground', bgColor: 'bg-muted' },
    ready: { label: 'Ready', color: 'text-primary', bgColor: 'bg-primary/10' },
    premium: { label: 'Premium', color: 'text-accent', bgColor: 'bg-accent/10' },
  };

  const cfg = statusConfig[status];

  return (
    <div className="bg-card rounded-xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Star className="w-5 h-5 text-primary" /> Route Quality
        </h2>
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${cfg.bgColor} ${cfg.color}`}>
          {cfg.label} · {score}%
        </span>
      </div>

      <Progress value={score} className="h-2" />

      {missing.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground font-medium">Missing for higher score:</p>
          <div className="flex flex-wrap gap-1.5">
            {missing.slice(0, 6).map((m) => (
              <span key={m} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {m}
              </span>
            ))}
            {missing.length > 6 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                +{missing.length - 6} more
              </span>
            )}
          </div>
        </div>
      )}

      {score >= 90 && (
        <p className="text-xs text-accent flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> Excellent! Your route has premium quality.
        </p>
      )}
    </div>
  );
}
