import { lazy, Suspense, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, MapPin, Globe } from 'lucide-react';
import type { WizardState, WizardPOI } from '@/hooks/use-wizard-state';

const RouteExplorerGlobe = lazy(() => import('@/components/RouteExplorerGlobe'));

const POI_TYPE_VALUES = ['viewpoint','monument','restaurant','gas_station','water_point','danger','parking','accommodation','other'] as const;

interface Props {
  state: WizardState;
  dispatch: React.Dispatch<any>;
}

export default function StepPOI({ state, dispatch }: Props) {
  const { t } = useTranslation();

  const addPOI = useCallback((lat?: number, lng?: number) => {
    const poi: WizardPOI = {
      name: '',
      type: 'viewpoint',
      lat: lat ?? state.latitude,
      lng: lng ?? state.longitude,
      description: '',
      fun_fact: '',
      photo_keys: [],
      sort_order: state.pois.length,
    };
    dispatch({ type: 'ADD_POI', poi });
  }, [dispatch, state.latitude, state.longitude, state.pois.length]);

  const updatePOI = useCallback((index: number, updates: Partial<WizardPOI>) => {
    dispatch({ type: 'UPDATE_POI', index, poi: { ...state.pois[index], ...updates } });
  }, [dispatch, state.pois]);

  const handleGlobeClick = useCallback((lat: number, lng: number) => {
    addPOI(lat, lng);
  }, [addPOI]);

  const hasTrack = !!state.gpxParsed && state.gpxParsed.trackPoints.length > 0;

  const previewRoute = useMemo(() => {
    if (!hasTrack && state.latitude === 0 && state.longitude === 0) return [];

    return [{
      id: 1,
      title: state.title || 'Draft route',
      latitude: hasTrack ? state.gpxParsed!.latitude : state.latitude,
      longitude: hasTrack ? state.gpxParsed!.longitude : state.longitude,
      location_string: state.locationString || 'Draft location',
      category_name: 'Draft',
      preview_track: hasTrack ? state.gpxParsed!.trackPoints : null,
    }];
  }, [hasTrack, state.gpxParsed, state.latitude, state.locationString, state.longitude, state.title]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">{t('wizard.step4.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('wizard.step4.subtitle')}</p>
      </div>

      {previewRoute.length > 0 && (
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            <Globe className="h-3.5 w-3.5" /> Click the globe to add POIs
          </div>
          <div className="h-[340px] overflow-hidden rounded-xl border border-border">
            <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
              <RouteExplorerGlobe
                routes={previewRoute}
                selectedRouteId={1}
                pois={state.pois}
                onGlobeClick={handleGlobeClick}
                badgeLabel="POI Globe"
              />
            </Suspense>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {state.pois.map((poi, index) => (
          <div key={index} className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
                <MapPin className="h-4 w-4" /> {t('wizard.step4.poi_label', { n: index + 1 })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => dispatch({ type: 'REMOVE_POI', index })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>{t('wizard.step4.name')} <span className="text-destructive">*</span></Label>
                <Input
                  value={poi.name}
                  onChange={(e) => updatePOI(index, { name: e.target.value })}
                  placeholder={t('wizard.step4.name_placeholder')}
                />
              </div>
              <div>
                <Label>{t('wizard.step4.type')} <span className="text-destructive">*</span></Label>
                <Select value={poi.type} onValueChange={(value) => updatePOI(index, { type: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POI_TYPE_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>{t(`wizard.step4.types.${value}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('wizard.step4.lat')}</Label>
                <Input
                  type="number"
                  step="0.00001"
                  value={poi.lat}
                  onChange={(e) => updatePOI(index, { lat: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>{t('wizard.step4.lng')}</Label>
                <Input
                  type="number"
                  step="0.00001"
                  value={poi.lng}
                  onChange={(e) => updatePOI(index, { lng: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div>
              <Label>{t('wizard.step4.description')} <span className="text-destructive">*</span></Label>
              <Textarea
                value={poi.description}
                onChange={(e) => updatePOI(index, { description: e.target.value })}
                placeholder={t('wizard.step4.description_placeholder')}
                rows={2}
              />
            </div>

            <div>
              <Label>{t('wizard.step4.fun_fact')}</Label>
              <Input
                value={poi.fun_fact}
                onChange={(e) => updatePOI(index, { fun_fact: e.target.value })}
                placeholder={t('wizard.step4.fun_fact_placeholder')}
              />
            </div>
          </div>
        ))}

        <Button variant="outline" onClick={() => addPOI()} className="w-full">
          <Plus className="mr-1 h-4 w-4" /> {t('wizard.step4.add_poi')}
        </Button>
      </div>
    </div>
  );
}
