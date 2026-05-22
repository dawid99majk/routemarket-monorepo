import { Checkbox } from '@/components/ui/checkbox';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Shield, AlertTriangle } from 'lucide-react';
import AiSuggestButton from './AiSuggestButton';
import type { WizardState } from '@/hooks/use-wizard-state';

const RISK_LEVELS = [
  { value: 'low', color: 'text-green-600' },
  { value: 'medium', color: 'text-amber-600' },
  { value: 'high', color: 'text-red-600' },
  { value: 'extreme', color: 'text-red-800' },
] as const;
const DATA_CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;

interface Props {
  state: WizardState;
  setField: (field: string, value: any) => void;
}

export default function StepSafety({ state, setField }: Props) {
  const { t } = useTranslation();
  const aiRouteData = {
    title: state.title,
    location_string: state.locationString,
    distance_km: state.distanceKm,
    elevation_gain_m: state.elevationGain,
    difficulty: state.difficulty,
    surface_type: state.surfaceType,
    risk_level: state.riskLevel,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Shield className="w-5 h-5" /> {t('wizard.step6.title')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t('wizard.step6.subtitle')}</p>
      </div>

      <div className="bg-card rounded-xl p-6 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between">
              <Label>{t('wizard.step6.risk_level')} <span className="text-destructive">*</span></Label>
              <AiSuggestButton
                field="risk_level"
                routeData={aiRouteData}
                onAccept={(data) => setField('riskLevel', data.suggestion)}
                label={t('wizard.ai.label')}
              />
            </div>
            <Select value={state.riskLevel} onValueChange={(v) => setField('riskLevel', v)}>
              <SelectTrigger><SelectValue placeholder={t('wizard.step6.select')} /></SelectTrigger>
              <SelectContent>
                {RISK_LEVELS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    <span className={r.color}>{t(`wizard.step6.risk_levels.${r.value}`)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('wizard.step6.verified_at')} <span className="text-destructive">*</span></Label>
            <Input
              type="date"
              value={state.lastVerifiedAt}
              onChange={(e) => setField('lastVerifiedAt', e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
        </div>

        <div>
          <Label>{t('wizard.step6.data_confidence')}</Label>
          <Select value={state.dataConfidence} onValueChange={(v) => setField('dataConfidence', v)}>
            <SelectTrigger><SelectValue placeholder={t('wizard.step6.select')} /></SelectTrigger>
            <SelectContent>
              {DATA_CONFIDENCE_VALUES.map((d) => (
                <SelectItem key={d} value={d}>{t(`wizard.step6.data_confidence_options.${d}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> {t('wizard.step6.hazards')}</Label>
            <AiSuggestButton
              field="hazards"
              routeData={aiRouteData}
              onAccept={(data) => setField('knownHazards', data.suggestion)}
              label={t('wizard.ai.label')}
            />
          </div>
          <Textarea
            value={state.knownHazards}
            onChange={(e) => setField('knownHazards', e.target.value)}
            placeholder={t('wizard.step6.hazards_ph')}
            rows={3}
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label>{t('wizard.step6.equipment')}</Label>
            <AiSuggestButton
              field="equipment"
              routeData={aiRouteData}
              onAccept={(data) => setField('requiredEquipment', data.suggestion)}
              label={t('wizard.ai.label')}
            />
          </div>
          <Textarea
            value={state.requiredEquipment}
            onChange={(e) => setField('requiredEquipment', e.target.value)}
            placeholder={t('wizard.step6.equipment_ph')}
            rows={3}
          />
        </div>

        <div className="flex flex-col gap-3 pt-2 border-t border-border">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={state.aiAssisted} onCheckedChange={(checked) => setField('aiAssisted', !!checked)} />
            {t('wizard.step6.ai_used')}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={state.petsFriendly} onCheckedChange={(checked) => setField('petsFriendly', !!checked)} />
            {t('wizard.step6.pets_friendly')}
          </label>
        </div>
      </div>
    </div>
  );
}
