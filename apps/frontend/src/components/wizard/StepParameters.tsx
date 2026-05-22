import { Checkbox } from '@/components/ui/checkbox';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Ruler, Mountain, Clock, Info } from 'lucide-react';
import AiSuggestButton from './AiSuggestButton';
import type { WizardState } from '@/hooks/use-wizard-state';

const DIFFICULTY_OPTIONS = ['easy', 'moderate', 'hard', 'expert'] as const;
const SEASON_OPTIONS = ['spring', 'summer', 'autumn', 'winter', 'year-round'] as const;
const LOOP_OPTIONS = ['loop', 'out-and-back', 'point-to-point'] as const;
const SURFACE_TAGS = ['asphalt', 'gravel', 'dirt', 'rocky', 'sand', 'mixed'] as const;

interface Props {
  state: WizardState;
  setField: (field: string, value: any) => void;
}

export default function StepParameters({ state, setField }: Props) {
  const { t } = useTranslation();
  const hasGpx = !!state.gpxParsed;

  const aiRouteData = {
    title: state.title,
    location_string: state.locationString,
    distance_km: state.distanceKm,
    elevation_gain_m: state.elevationGain,
    surface_type: state.surfaceType,
    loop_type: state.loopType,
    difficulty: state.difficulty,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">{t('wizard.step2.title')}</h2>
        {hasGpx && (
          <div className="flex items-center gap-2 mt-1 text-sm text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
            <Info className="w-4 h-4 shrink-0" />
            {t('wizard.step2.gpx_filled_note')}
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl p-6 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label className="flex items-center gap-1"><Ruler className="w-3.5 h-3.5" /> {t('wizard.step2.distance')} <span className="text-destructive">*</span></Label>
            <Input type="number" min="0" step="0.1" value={state.distanceKm} onChange={(e) => setField('distanceKm', e.target.value)} placeholder="0.0" />
          </div>
          <div>
            <Label className="flex items-center gap-1"><Mountain className="w-3.5 h-3.5" /> {t('wizard.step2.elevation')}</Label>
            <Input type="number" min="0" value={state.elevationGain} onChange={(e) => setField('elevationGain', e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {t('wizard.step2.time')}</Label>
            <Input type="number" min="0" step="0.1" value={state.estimatedTime} onChange={(e) => setField('estimatedTime', e.target.value)} placeholder="0.0" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between">
              <Label>{t('wizard.step2.difficulty')} <span className="text-destructive">*</span></Label>
              <AiSuggestButton
                field="difficulty"
                routeData={aiRouteData}
                onAccept={(data) => setField('difficulty', data.suggestion)}
                label={t('wizard.ai.label')}
              />
            </div>
            <Select value={state.difficulty} onValueChange={(v) => setField('difficulty', v)}>
              <SelectTrigger><SelectValue placeholder={t('wizard.step2.select')} /></SelectTrigger>
              <SelectContent>
                {DIFFICULTY_OPTIONS.map((d) => (
                  <SelectItem key={d} value={d}>{t(`wizard.step2.difficulty_options.${d}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('wizard.step2.loop_type')} <span className="text-destructive">*</span></Label>
            <Select value={state.loopType} onValueChange={(v) => setField('loopType', v)}>
              <SelectTrigger><SelectValue placeholder={t('wizard.step2.select')} /></SelectTrigger>
              <SelectContent>
                {LOOP_OPTIONS.map((l) => (
                  <SelectItem key={l} value={l}>{t(`wizard.step2.loop_options.${l}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>{t('wizard.step2.season')}</Label>
          <div className="flex flex-wrap gap-3 mt-2">
            {SEASON_OPTIONS.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={state.season.includes(s)}
                  onCheckedChange={(checked) => {
                    setField('season', checked ? [...state.season, s] : state.season.filter(x => x !== s));
                  }}
                />
                {t(`wizard.step2.season_options.${s}`)}
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label>{t('wizard.step2.surface')}</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {SURFACE_TAGS.map((tag) => {
              const isActive = state.surfaceType.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    const current = state.surfaceType ? state.surfaceType.split(',').map(s => s.trim()) : [];
                    const next = isActive ? current.filter(t => t !== tag) : [...current, tag];
                    setField('surfaceType', next.join(', '));
                  }}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    isActive
                      ? 'bg-accent text-accent-foreground border-accent'
                      : 'bg-muted text-muted-foreground border-border hover:border-foreground/30'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{t('wizard.step2.start_point')}</Label>
            <Input value={state.startPoint} onChange={(e) => setField('startPoint', e.target.value)} placeholder={t('wizard.step2.coords_or_name')} />
          </div>
          <div>
            <Label>{t('wizard.step2.end_point')}</Label>
            <Input value={state.endPoint} onChange={(e) => setField('endPoint', e.target.value)} placeholder={t('wizard.step2.coords_or_name')} />
          </div>
        </div>
      </div>
    </div>
  );
}
